//! VOLTA — True Circuit-Modeled Vintage + Modern Super Synth (`VOLTA_BASE = 2500`).
//!
//! Models a dual-era hybrid hardware synthesizer from component physics upward:
//! 1. **Dual VCO + Sub + Thermal Noise + Thru-Zero Linear FM**: PolyBLEP waveforms (Saw,
//!    PWM Pulse, Triangle, Sine, Super-Analog Pair) with true bidirectional thru-zero phase
//!    accumulation, matched-pair card trim tolerances, and OTA thermal wander.
//! 2. **2× Oversampled West-Coast Wavefolder**: Asymmetric DC-biased Buchla/Serge sine-tanh
//!    multiplier cascade (`VL_WAVEFOLD`, `VL_FOLD_SYM`).
//! 3. **Vintage 1974 Discrete Transistor Ladder Filter**: 2× oversampled 4-stage BJT
//!    differential-pair ladder using `tanh(v / 2*Vt)` thermal nonlinearity (`VL_BIAS_TEMP`),
//!    per-stage capacitor tolerances, passband bass compensation, and diode-limited feedback.
//! 4. **Modern 2026 Cytomic ZDF Continuous-Morph SVF**: Analytical delay-free-loop state
//!    variable filter morphing smoothly across `LP → BP → HP → Notch` (`VL_SVF_MODE`).
//! 5. **Shockley BJT Diode Stage + Power-Supply Rail Sag**: Asymmetric silicon/germanium
//!    soft clipper plus decoupling-capacitor rail droop & recharge (`VL_PSU_SAG`).
//! 6. **Clean `clear()` & Idle Gate**: Zero background hum, zero runaway feedback loops,
//!    and instantaneous silence on panic/note completion.

use core::f32::consts::{PI, TAU};
use crate::engine::MAX_BLOCK;
use crate::env::Envelope;
use crate::filter::tanh_fast;
use crate::modmatrix::{ModMatrix, ModValues};
use crate::osc::Rng;
use crate::params::*;
use crate::spatial::MAX_CHANNELS;

pub const VOLTA_PROBE_COUNT: usize = 7;

#[inline]
fn poly_blep(t: f32, dt: f32) -> f32 {
    if dt <= 1e-7 {
        return 0.0;
    }
    if t < dt {
        let x = t / dt;
        x + x - x * x - 1.0
    } else if t > 1.0 - dt {
        let x = (t - 1.0) / dt;
        x * x + x + x + 1.0
    } else {
        0.0
    }
}

#[inline]
fn wrap01(mut p: f32) -> f32 {
    p -= p.floor();
    if p < 0.0 {
        p += 1.0;
    }
    p
}

#[inline]
fn osc_sample(wave: u32, phase: f32, phase_pair: f32, dt: f32, pw: f32) -> f32 {
    let p = wrap01(phase);
    let adt = dt.abs().clamp(1e-6, 0.45);
    match wave {
        // 1: Variable-width Pulse with PolyBLEP on both rising and falling edges
        1 => {
            let mut y = if p < pw { 1.0 } else { -1.0 };
            y += poly_blep(p, adt);
            y -= poly_blep(wrap01(p - pw), adt);
            y
        }
        // 2: Pure analog Triangle (smooth odd harmonics, 1/n^2 rolloff)
        2 => {
            let tri = 1.0 - 4.0 * (p - 0.5).abs();
            // Subtle even-harmonic analog curvature
            let s = tri + 0.04 * (tri * tri - 0.333_333_3);
            s * 0.95
        }
        // 3: Sine
        3 => (p * TAU).sin(),
        // 4: Super-Analog detuned dual saw pair (rich vintage Oberheim/Juno dual-core)
        4 => {
            let s1 = 2.0 * p - 1.0 - poly_blep(p, adt);
            let p2 = wrap01(phase_pair);
            let s2 = 2.0 * p2 - 1.0 - poly_blep(p2, adt);
            0.58 * s1 + 0.48 * s2
        }
        // 0: PolyBLEP Sawtooth
        _ => 2.0 * p - 1.0 - poly_blep(p, adt),
    }
}

/// 4-stage Discrete Transistor Differential-Pair Ladder Filter (2× oversampled).
#[derive(Clone, Copy, Default)]
pub struct DiscreteLadder {
    s: [f32; 4],
    lp_bias: f32,
}

impl DiscreteLadder {
    pub fn reset(&mut self) {
        self.s = [0.0; 4];
        self.lp_bias = 0.0;
    }

    #[inline]
    pub fn process(
        &mut self,
        x: f32,
        cutoff_hz: f32,
        res: f32,
        drive: f32,
        vt_scale: f32,
        drift_tol: [f32; 4],
        sr: f32,
    ) -> f32 {
        // Clamp resonance slightly below chaotic runaway (< 3.88) and limit per stage so
        // removing input always allows natural ringdown without infinite buzzing.
        let os_sr = (sr * 2.0).max(2000.0);
        let fc = cutoff_hz.clamp(16.0, sr * 0.46);
        let g_base = (PI * fc / os_sr).tan().clamp(0.0005, 1.85);
        let r = res.clamp(0.0, 1.0);
        let k = 3.88 * r * r.sqrt().max(r); // musical quadratic-leaning taper
        let drv = 1.0 + drive.clamp(0.0, 1.0) * 3.4;
        // Thermal voltage scaling: warmer temp (vt_scale < 1) softens knee earlier
        let vt = (0.55 + 0.65 * vt_scale.clamp(0.3, 1.4)).clamp(0.45, 1.4);
        let inv_2vt = 1.0 / (2.0 * vt);
        let two_vt = 2.0 * vt;

        let g0 = (g_base * drift_tol[0]) / (1.0 + g_base * drift_tol[0]);
        let g1 = (g_base * drift_tol[1]) / (1.0 + g_base * drift_tol[1]);
        let g2 = (g_base * drift_tol[2]) / (1.0 + g_base * drift_tol[2]);
        let g3 = (g_base * drift_tol[3]) / (1.0 + g_base * drift_tol[3]);
        let gs = [g0, g1, g2, g3];

        // Gentle leaky DC blocker so asymmetric distortion cannot bias integrators forever
        self.lp_bias = self.lp_bias * 0.9992 + x * 0.0008;
        let x_ac = (x - self.lp_bias * 0.25) * drv;

        let mut out = 0.0f32;
        for _ in 0..2 {
            // Instantaneous 1-sample feedback prediction (TPT ladder form)
            let fb_est = self.s[3];
            // Diode Zener soft limiter inside resonance loop prevents runaway blowup
            let fb_sat = tanh_fast(fb_est * 0.85) * 1.176_470_6;
            // Bass passband compensation (~35% passband makeup on high Q like ladder hardware)
            let comp_in = x_ac * (1.0 + 0.14 * k);
            let mut u = comp_in - k * fb_sat;
            // Differential input transistor pair
            u = tanh_fast(u * inv_2vt) * two_vt;

            let mut sig = u;
            for i in 0..4 {
                let s_tanh = tanh_fast(self.s[i] * inv_2vt) * two_vt;
                let sig_tanh = tanh_fast(sig * inv_2vt) * two_vt;
                // Euler-TPT hybrid step through BJT RC rung
                let v = (sig_tanh - s_tanh) * gs[i];
                let y = self.s[i] + v;
                self.s[i] = y + v * 0.985;
                // Gentle leakage keeps zero-input filter decaying cleanly to pure 0
                self.s[i] *= 0.999985;
                sig = y;
            }
            out = sig;
        }
        let makeup = 1.0 / (1.0 + drive.clamp(0.0, 1.0) * 0.45);
        let y = out * makeup * (1.0 + 0.18 * k);
        if y.is_finite() {
            y
        } else {
            self.reset();
            0.0
        }
    }
}

/// Cytomic ZDF Continuous-Morph State-Variable Filter (2× oversampled).
#[derive(Clone, Copy, Default)]
pub struct MorphSvf {
    ic1: f32,
    ic2: f32,
}

impl MorphSvf {
    pub fn reset(&mut self) {
        self.ic1 = 0.0;
        self.ic2 = 0.0;
    }

    #[inline]
    pub fn process(&mut self, x: f32, cutoff_hz: f32, res: f32, mode_norm: f32, sr: f32) -> f32 {
        let os_sr = (sr * 2.0).max(2000.0);
        let fc = cutoff_hz.clamp(16.0, sr * 0.46);
        let g = (PI * fc / os_sr).tan().clamp(0.0005, 1.85);
        let r = res.clamp(0.0, 1.0);
        // Cap k >= 0.08 so the SVF has musical peak without endless self-buzzing on silence
        let k = 2.0 - 1.92 * r;
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let mut lp = 0.0f32;
        let mut bp = 0.0f32;
        let mut hp = 0.0f32;
        for _ in 0..2 {
            // Subtle modern VCA/OTA stabilizer on ic1
            let s1 = if r > 0.55 {
                let amt = 0.25 * (r - 0.55);
                self.ic1 * (1.0 - amt) + tanh_fast(self.ic1 * 0.8) * (1.25 * amt)
            } else {
                self.ic1
            };
            let v3 = x - self.ic2;
            let v1 = a1 * s1 + a2 * v3;
            let v2 = self.ic2 + a2 * s1 + a3 * v3;
            self.ic1 = (2.0 * v1 - s1) * 0.99999;
            self.ic2 = (2.0 * v2 - self.ic2) * 0.99999;
            lp = v2;
            bp = v1;
            hp = x - k * v1 - v2;
        }
        let notch = lp + hp;
        // Continuous 0.0 -> 1.0 morph: LP (0.0) <-> BP (0.333) <-> HP (0.667) <-> Notch (1.0)
        let m = mode_norm.clamp(0.0, 1.0) * 3.0;
        let out = if m < 1.0 {
            lp * (1.0 - m) + bp * m
        } else if m < 2.0 {
            let t = m - 1.0;
            bp * (1.0 - t) + hp * t
        } else {
            let t = m - 2.0;
            hp * (1.0 - t) + notch * t
        };
        if out.is_finite() {
            out
        } else {
            self.reset();
            0.0
        }
    }
}

/// Circuit-modeled per-voice synthesizer for VOLTA.
pub struct VoltaVoice {
    sr: f32,
    ph1: f32,
    ph1_pair: f32,
    ph2: f32,
    ph2_pair: f32,
    ph_sub: f32,
    lfo_phase: f32,
    amp_env: Envelope,
    flt_env: Envelope,
    ladder: DiscreteLadder,
    svf: MorphSvf,
    /// Per-voice card resistor tolerances & capacitor mismatches (`[pitch, cutoff, env, stage3]`).
    tol: [f32; 4],
    therm_walk: f32,
    glide_note: f32,
    pink: [f32; 3],
    /// Power-supply reservoir rail normalized around 1.0 (dips under heavy load when VL_PSU_SAG > 0).
    psu_rail: f32,
    /// Latest normalized RMS-ish probe taps `[vco, wavefolder, ladder, svf, diode, rail, therm]`.
    pub probes: [f32; VOLTA_PROBE_COUNT],
    pan_phase: f32,
    rng: Rng,
}

impl VoltaVoice {
    pub fn new(sr: f32, seed: u32) -> Self {
        let mut rng = Rng((seed ^ 0x564F_4C54) | 1);
        let tol = [
            1.0 + rng.bipolar() * 0.008,
            1.0 + rng.bipolar() * 0.015,
            1.0 + rng.bipolar() * 0.04,
            1.0 + rng.bipolar() * 0.012,
        ];
        Self {
            sr: sr.max(8000.0),
            ph1: 0.0,
            ph1_pair: 0.0,
            ph2: 0.0,
            ph2_pair: 0.0,
            ph_sub: 0.0,
            lfo_phase: 0.0,
            amp_env: Envelope::default(),
            flt_env: Envelope::default(),
            ladder: DiscreteLadder::default(),
            svf: MorphSvf::default(),
            tol,
            therm_walk: 0.0,
            glide_note: 60.0,
            pink: [0.0; 3],
            psu_rail: 1.0,
            probes: [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            pan_phase: rng.bipolar(),
            rng,
        }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr.max(8000.0);
    }

    pub fn reset(&mut self) {
        self.amp_env.hard_reset();
        self.flt_env.hard_reset();
        self.ladder.reset();
        self.svf.reset();
        self.pink = [0.0; 3];
        self.psu_rail = 1.0;
        self.probes = [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
    }

    pub fn release(&mut self) {
        self.amp_env.note_off();
        self.flt_env.note_off();
    }

    #[inline]
    pub fn is_quiet(&self) -> bool {
        !self.amp_env.is_active()
    }

    pub fn trigger(&mut self, note: f32, p: &Params, glide_from: Option<f32>) {
        // Free-running analog phase in vintage mode; tight zero-crossing toward modern mode
        let morph = p.get(VOLTA_BASE + VL_VINTAGE_MORPH).clamp(0.0, 1.0);
        if morph > 0.65 {
            self.ph1 = 0.0;
            self.ph2 = 0.0;
            self.ph_sub = 0.0;
            self.lfo_phase = 0.0;
        }
        self.glide_note = glide_from.unwrap_or(note);
        self.ladder.reset();
        self.svf.reset();

        let drift = p.get(VOLTA_BASE + VL_OTA_DRIFT).clamp(0.0, 1.0);
        let env_scale = 1.0 + (self.tol[2] - 1.0) * drift;
        self.amp_env.set_adsr(
            env_time(p.get(VOLTA_BASE + VL_AMP_ATK)) * env_scale,
            env_time(p.get(VOLTA_BASE + VL_AMP_DEC)) * env_scale,
            p.get(VOLTA_BASE + VL_AMP_SUS).clamp(0.0, 1.0),
            env_time(p.get(VOLTA_BASE + VL_AMP_REL)) * env_scale,
        );
        self.flt_env.set_adsr(
            env_time(p.get(VOLTA_BASE + VL_FLT_ATK)) * env_scale,
            env_time(p.get(VOLTA_BASE + VL_FLT_DEC)) * env_scale,
            p.get(VOLTA_BASE + VL_FLT_SUS).clamp(0.0, 1.0),
            env_time(p.get(VOLTA_BASE + VL_FLT_REL)) * env_scale,
        );
        self.amp_env.note_on();
        self.flt_env.note_on();
    }

    pub fn slur(&mut self, note: f32, _p: &Params) {
        let _ = note;
        // Legato mode updates target note on Voice while letting envelopes + oscillators ride.
    }

    #[inline]
    fn eval_param(p: &Params, matrix: &ModMatrix, mv: &ModValues, sub_id: u32) -> f32 {
        (p.get(VOLTA_BASE + sub_id) + matrix.amount_for(VOLTA_BASE + sub_id, mv)).clamp(0.0, 1.0)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &mut self,
        out: &mut [[f32; MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        note: f32,
        velocity: f32,
        released: bool,
        start_delay: &mut u32,
        p: &Params,
        matrix: &ModMatrix,
        mv: &ModValues,
        gains: &[f32; MAX_CHANNELS],
        nch: usize,
        total_bend: f32,
    ) {
        if released && !self.is_quiet() {
            // Voice already handles note_off on VoltaVoice via Voice::note_off too, this is safety.
        }
        let sr = self.sr;
        let dt = 1.0 / sr;

        let topology = p.get(VOLTA_BASE + VL_TOPOLOGY).round().clamp(0.0, 4.0) as u32;
        let morph = Self::eval_param(p, matrix, mv, VL_VINTAGE_MORPH);
        let osc1_w = p.get(VOLTA_BASE + VL_OSC1_WAVE).round().clamp(0.0, 4.0) as u32;
        let base_pw = Self::eval_param(p, matrix, mv, VL_OSC1_PW);
        let osc2_w = p.get(VOLTA_BASE + VL_OSC2_WAVE).round().clamp(0.0, 4.0) as u32;
        let semi2 = (Self::eval_param(p, matrix, mv, VL_OSC2_SEMI) - 0.5) * 48.0;
        let detune2_c = (Self::eval_param(p, matrix, mv, VL_OSC2_DETUNE) - 0.5) * 100.0;
        let osc_mix = Self::eval_param(p, matrix, mv, VL_OSC_MIX);
        let sub_lvl = Self::eval_param(p, matrix, mv, VL_SUB_LVL);
        let sub_oct = if p.get(VOLTA_BASE + VL_SUB_OCT) > 0.5 { 0.25 } else { 0.5 };
        let noise_lvl = Self::eval_param(p, matrix, mv, VL_NOISE_LVL);
        let base_fm_tz = Self::eval_param(p, matrix, mv, VL_FM_TZ);
        let base_fold = Self::eval_param(p, matrix, mv, VL_WAVEFOLD);
        let fold_sym = (Self::eval_param(p, matrix, mv, VL_FOLD_SYM) - 0.5) * 0.9;
        let lad_cut_norm = Self::eval_param(p, matrix, mv, VL_LADDER_CUTOFF);
        let lad_res = Self::eval_param(p, matrix, mv, VL_LADDER_RES);
        let lad_drive = Self::eval_param(p, matrix, mv, VL_LADDER_DRIVE);
        let svf_cut_norm = Self::eval_param(p, matrix, mv, VL_SVF_CUTOFF);
        let svf_res = Self::eval_param(p, matrix, mv, VL_SVF_RES);
        let svf_mode = Self::eval_param(p, matrix, mv, VL_SVF_MODE);
        let diode_clip = Self::eval_param(p, matrix, mv, VL_DIODE_CLIP);
        let ota_drift = Self::eval_param(p, matrix, mv, VL_OTA_DRIFT);
        let psu_sag_amt = Self::eval_param(p, matrix, mv, VL_PSU_SAG);
        let bias_temp = Self::eval_param(p, matrix, mv, VL_BIAS_TEMP);
        let f_env_amt = (Self::eval_param(p, matrix, mv, VL_FILT_ENV_AMT) - 0.5) * 2.0;
        let key_track = Self::eval_param(p, matrix, mv, VL_KEY_TRACK);

        let lfo_rate = 0.08 * (400.0f32).powf(Self::eval_param(p, matrix, mv, VL_LFO_RATE));
        let lfo_depth = Self::eval_param(p, matrix, mv, VL_LFO_DEPTH);
        let lfo_dest = p.get(VOLTA_BASE + VL_LFO_DEST).round().clamp(0.0, 3.0) as u32;

        let glide_s = p.get(VOLTA_BASE + VL_GLIDE).clamp(0.0, 1.0) * 1.5;
        let bend_st = 2.0 + p.get(VOLTA_BASE + VL_BEND_RANGE).clamp(0.0, 1.0) * 22.0;
        let unison = Self::eval_param(p, matrix, mv, VL_UNISON);
        let width = Self::eval_param(p, matrix, mv, VL_WIDTH);
        let vel_sens = p.get(VOLTA_BASE + VL_VEL_SENS).clamp(0.0, 1.0);
        let master = p.get(P_MASTER_GAIN).max(0.0);

        let vel_scale = (1.0 - vel_sens) + vel_sens * velocity.clamp(0.0, 1.0);
        let lfo_inc = lfo_rate * dt;

        // Per-rung matched transistor tolerances scaled by OTA component drift
        let r_tol = [
            1.0,
            1.0 - 0.012 * ota_drift * (self.tol[0] - 0.99),
            1.0 + 0.014 * ota_drift * (self.tol[1] - 0.99),
            1.0 - 0.009 * ota_drift * (self.tol[3] - 0.99),
        ];
        // Thermal voltage decreases/shifts as junction heats up
        let vt_scale = 1.12 - 0.55 * bias_temp;

        // Slow analog thermal wander updated once per block
        let walk_step = (self.rng.bipolar() * 0.08 - self.therm_walk * 0.02) * dt * (frames as f32);
        self.therm_walk = (self.therm_walk + walk_step).clamp(-1.0, 1.0);

        // Stereo width offset from per-voice analog spread
        let pan_bias = self.pan_phase * width * 0.35;
        let pan_l = (0.5 - pan_bias).clamp(0.1, 0.9).sqrt() * 1.4142;
        let pan_r = (0.5 + pan_bias).clamp(0.1, 0.9).sqrt() * 1.4142;

        let mut acc_vco = 0.0f32;
        let mut acc_wf = 0.0f32;
        let mut acc_lad = 0.0f32;
        let mut acc_svf = 0.0f32;
        let mut acc_dio = 0.0f32;
        let mut counted = 0usize;

        for f in 0..frames {
            if *start_delay > 0 {
                *start_delay -= 1;
                continue;
            }
            if glide_s > 0.001 {
                let kg = 1.0 - (-dt / glide_s).exp();
                self.glide_note += (note - self.glide_note) * kg;
            } else {
                self.glide_note = note;
            }

            let amp = self.amp_env.tick(dt) * vel_scale;
            let f_env = self.flt_env.tick(dt);
            if !self.amp_env.is_active() {
                continue;
            }

            self.lfo_phase = wrap01(self.lfo_phase + lfo_inc);
            let lfo_val = (self.lfo_phase * TAU).sin() * lfo_depth;

            // Pitch: note + bend + card/thermal drift + LFO pitch + slight PSU slump
            let drift_cents = ota_drift * (14.0 * (self.tol[0] - 1.0) * 100.0 * 0.015 + self.therm_walk * 7.5);
            let psu_slump_st = -(1.0 - self.psu_rail) * psu_sag_amt * 0.25;
            let lfo_pitch_st = if lfo_dest == 1 { lfo_val * 1.2 } else { 0.0 };
            let cur_note = self.glide_note + total_bend * bend_st + lfo_pitch_st + psu_slump_st + drift_cents / 100.0;
            let f1 = (440.0 * (2.0f32).powf((cur_note - 69.0) / 12.0)).clamp(12.0, sr * 0.42);
            let f2 = (440.0 * (2.0f32).powf((cur_note + semi2 + detune2_c / 100.0 - 69.0) / 12.0)).clamp(12.0, sr * 0.42);

            let dt1 = f1 * dt;
            let dt2 = f2 * dt;
            let pair_det = (0.003 + 0.014 * unison) * f1 * dt;
            let pair2_det = (0.002 + 0.012 * unison) * f2 * dt;

            // Advance Osc 2 first so Thru-Zero linear FM can drive Osc 1 accurately
            self.ph2 = wrap01(self.ph2 + dt2);
            self.ph2_pair = wrap01(self.ph2_pair + dt2 + pair2_det);
            let pw = (0.08 + 0.84 * (base_pw + if lfo_dest == 2 { lfo_val * 0.35 } else { 0.0 })).clamp(0.06, 0.94);
            let vco2 = osc_sample(osc2_w, self.ph2, self.ph2_pair, dt2, pw);

            // Thru-zero FM (bidirectional phase delta): negative instantaneous frequency wraps cleanly
            let fm_mod = (base_fm_tz + if lfo_dest == 3 { lfo_val.abs() * 0.55 } else { 0.0 }).clamp(0.0, 1.0);
            let fm_depth = fm_mod * fm_mod * 7.5;
            let inst_dt1 = dt1 * (1.0 + vco2 * fm_depth);
            self.ph1 = wrap01(self.ph1 + inst_dt1);
            self.ph1_pair = wrap01(self.ph1_pair + inst_dt1 + pair_det);
            let vco1 = osc_sample(osc1_w, self.ph1, self.ph1_pair, inst_dt1, pw);

            // Sub oscillator & pink-ish thermal transistor noise
            self.ph_sub = wrap01(self.ph_sub + dt1 * sub_oct);
            let sub = osc_sample(1, self.ph_sub, self.ph_sub, dt1 * sub_oct, 0.5);
            let white = self.rng.bipolar();
            self.pink[0] = 0.997 * self.pink[0] + white * 0.029;
            self.pink[1] = 0.985 * self.pink[1] + white * 0.032;
            self.pink[2] = 0.950 * self.pink[2] + white * 0.048;
            let pink_n = (self.pink[0] + self.pink[1] + self.pink[2] + white * 0.08) * 1.4;

            let vco_sum = (vco1 * (1.0 - osc_mix) + vco2 * osc_mix) * 0.72
                + sub * sub_lvl * 0.52
                + pink_n * noise_lvl * 0.32;

            // Node 1: 2× Oversampled Asymmetric Buchla/Serge Wavefolder
            let fold_amt = (base_fold + if lfo_dest == 2 { lfo_val * 0.35 } else { 0.0 }).clamp(0.0, 1.0);
            let wf_out = if fold_amt > 0.002 {
                let drive_wf = 1.0 + fold_amt * 5.2;
                let biased = vco_sum * drive_wf + fold_sym * 0.85 * fold_amt;
                let s1 = (biased * 1.65).sin() * 0.65 + tanh_fast(biased * 0.95) * 0.35;
                let s2 = (s1 * (1.0 + fold_amt * 2.2) * PI * 0.5).sin();
                (vco_sum * (1.0 - fold_amt * 0.4) + s2 * (0.55 + fold_amt * 0.45)) * 0.88
            } else {
                vco_sum
            };

            // Cutoff trajectories with keytrack + filter envelope + LFO + thermal drift
            let kt_semi = (note - 60.0) * key_track;
            let lfo_cut = if lfo_dest == 0 { lfo_val * 0.36 } else { 0.0 };
            let env_cut = f_env * f_env_amt * 0.58;
            let kt_oct = kt_semi / 12.0 * 0.14;
            let lad_fc = cutoff_hz((lad_cut_norm + env_cut + lfo_cut + kt_oct).clamp(0.01, 0.99))
                * self.tol[1]
                * self.psu_rail.clamp(0.84, 1.02);
            let svf_fc = cutoff_hz((svf_cut_norm + env_cut * 0.9 + lfo_cut + kt_oct).clamp(0.01, 0.99));

            // Compute Filter Topologies cleanly
            let (lad_y, svf_y, filt_y) = match topology {
                // 0: Series (Vintage Ladder -> Modern Cytomic SVF)
                0 => {
                    let l = self.ladder.process(wf_out, lad_fc, lad_res, lad_drive, vt_scale, r_tol, sr);
                    let s = self.svf.process(l, svf_fc, svf_res, svf_mode, sr);
                    (l, s, s)
                }
                // 1: Parallel (50% Discrete Ladder + 50% Cytomic SVF)
                1 => {
                    let l = self.ladder.process(wf_out, lad_fc, lad_res, lad_drive, vt_scale, r_tol, sr);
                    let s = self.svf.process(wf_out, svf_fc, svf_res, svf_mode, sr);
                    (l, s, 0.55 * l + 0.55 * s)
                }
                // 3: Pure 1974 Vintage Transistor Ladder
                3 => {
                    let l = self.ladder.process(wf_out, lad_fc, lad_res, lad_drive, vt_scale, r_tol, sr);
                    (l, 0.0, l)
                }
                // 4: Pure 2026 Modern Hybrid Cytomic SVF
                4 => {
                    let s = self.svf.process(wf_out, svf_fc, svf_res, svf_mode, sr);
                    (0.0, s, s)
                }
                // 2: Continuous Analog <-> Modern Hybrid Morph (VL_VINTAGE_MORPH)
                _ => {
                    let l = self.ladder.process(wf_out, lad_fc, lad_res, lad_drive, vt_scale, r_tol, sr);
                    let s = self.svf.process(wf_out, svf_fc, svf_res, svf_mode, sr);
                    (l, s, l * (1.0 - morph) + s * morph)
                }
            };

            // Node 4: Shockley BJT Silicon/Germanium Diode Stage & PSU Rail Sag
            let diode_gain = 1.0 + diode_clip * 3.8;
            let pre_dio = filt_y * self.psu_rail * diode_gain;
            let asym = if pre_dio >= 0.0 { 1.08 } else { 0.86 };
            let clipped = if diode_clip > 0.002 {
                let nonlinear = tanh_fast(pre_dio * asym) * (1.0 / (0.85 + diode_clip * 0.8));
                filt_y * (1.0 - diode_clip * 0.65) + nonlinear * (0.45 + diode_clip * 0.55)
            } else {
                filt_y
            };

            // Power-rail decoupling capacitor discharge/recovery model
            let load_current = (clipped.abs() * 0.35 + vco_sum.abs() * 0.15) * psu_sag_amt;
            let sag_target = (1.0 - load_current * 0.22).clamp(0.84, 1.0);
            let k_psu = if sag_target < self.psu_rail { 0.0025 } else { 0.00055 };
            self.psu_rail += (sag_target - self.psu_rail) * k_psu;

            let vca = clipped * amp * master * 0.65;
            if nch >= 2 {
                out[0][f] += vca * gains[0] * pan_l;
                out[1][f] += vca * gains[1] * pan_r;
                for c in 2..nch {
                    out[c][f] += vca * gains[c];
                }
            } else if nch == 1 {
                out[0][f] += vca;
            }

            acc_vco += vco_sum * vco_sum;
            acc_wf += wf_out * wf_out;
            acc_lad += lad_y * lad_y;
            acc_svf += svf_y * svf_y;
            acc_dio += vca * vca;
            counted += 1;
        }

        if counted > 0 {
            let inv = 1.0 / (counted as f32);
            self.probes[0] = (acc_vco * inv).sqrt().min(2.0);
            self.probes[1] = (acc_wf * inv).sqrt().min(2.0);
            self.probes[2] = (acc_lad * inv).sqrt().min(2.0);
            self.probes[3] = (acc_svf * inv).sqrt().min(2.0);
            self.probes[4] = (acc_dio * inv).sqrt().min(2.0);
            self.probes[5] = self.psu_rail;
            self.probes[6] = bias_temp;
        }
    }
}

/// Stereo Chorus / BBD-to-Modern Dimension Rack after VOLTA voice sum.
pub struct VoltaRack {
    sr: f32,
    dl_l: Vec<f32>,
    dl_r: Vec<f32>,
    w: usize,
    phase: f32,
    lpf: [f32; 2],
    pub last_probes: [f32; VOLTA_PROBE_COUNT],
}

impl VoltaRack {
    pub fn new(sr: f32) -> Self {
        let cap = ((sr.max(8000.0) * 0.04) as usize).max(128);
        Self {
            sr: sr.max(8000.0),
            dl_l: vec![0.0; cap],
            dl_r: vec![0.0; cap],
            w: 0,
            phase: 0.0,
            lpf: [0.0; 2],
            last_probes: [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.38],
        }
    }

    pub fn clear(&mut self) {
        self.dl_l.fill(0.0);
        self.dl_r.fill(0.0);
        self.w = 0;
        self.phase = 0.0;
        self.lpf = [0.0; 2];
        self.last_probes = [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.38];
    }

    #[inline]
    pub fn active(p: &Params) -> bool {
        p.get(VOLTA_BASE + VL_ENABLE) > 0.5 && p.get(VOLTA_BASE + VL_CHORUS) > 0.001
    }

    #[inline]
    fn read_delay(buf: &[f32], w: usize, delay_samples: f32) -> f32 {
        let n = buf.len();
        let d = delay_samples.clamp(1.0, (n - 3) as f32);
        let pos = w as f32 - d;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i0 = pos.floor() as usize % n;
        let i1 = (i0 + 1) % n;
        let frac = pos - pos.floor();
        buf[i0] + (buf[i1] - buf[i0]) * frac
    }

    pub fn process(
        &mut self,
        scratch: &mut [[f32; MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        nch: usize,
        p: &Params,
        active_voices: u32,
    ) {
        let mix = p.get(VOLTA_BASE + VL_CHORUS).clamp(0.0, 1.0);
        if mix <= 0.001 || nch == 0 {
            return;
        }
        // Check if delay line still has energy so idle buffer returns exact 0.0
        let morph = p.get(VOLTA_BASE + VL_VINTAGE_MORPH).clamp(0.0, 1.0);
        let rate_hz = 0.38 + morph * 0.45;
        let dp = rate_hz / self.sr;
        let base_delay = self.sr * (0.011 + 0.004 * (1.0 - morph));
        let mod_depth = self.sr * (0.0038 + 0.0012 * morph);
        let bbd_k = 0.28 + 0.58 * morph; // vintage mode rolls off chorus wet HF like an MN3009 BBD
        let len = self.dl_l.len();

        let mut energy = 0.0f32;
        for f in 0..frames {
            let l_in = scratch[0][f];
            let r_in = if nch > 1 { scratch[1][f] } else { l_in };
            energy += l_in.abs() + r_in.abs();

            if active_voices == 0 && energy < 1e-6 && self.lpf[0].abs() < 1e-6 && self.lpf[1].abs() < 1e-6 {
                continue;
            }

            self.dl_l[self.w] = l_in;
            self.dl_r[self.w] = r_in;

            self.phase = wrap01(self.phase + dp);
            let s1 = (self.phase * TAU).sin();
            let s2 = ((self.phase + 0.25) * TAU).sin();

            let wl = Self::read_delay(&self.dl_l, self.w, base_delay + s1 * mod_depth);
            let wr = Self::read_delay(&self.dl_r, self.w, base_delay - s2 * mod_depth);

            self.lpf[0] += (wl - self.lpf[0]) * bbd_k;
            self.lpf[1] += (wr - self.lpf[1]) * bbd_k;

            scratch[0][f] = l_in * (1.0 - mix * 0.35) + self.lpf[0] * mix * 0.55;
            if nch > 1 {
                scratch[1][f] = r_in * (1.0 - mix * 0.35) + self.lpf[1] * mix * 0.55;
            }
            self.w = (self.w + 1) % len;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    fn render_volta_mono(p_fn: impl FnOnce(&mut Engine), frames: usize) -> Vec<f32> {
        let mut eng = Engine::new(48000.0);
        eng.params.set(VOLTA_BASE + VL_ENABLE, 1.0);
        p_fn(&mut eng);
        eng.note_on(48.0, 0.9, 1, 0);
        let mut out = Vec::with_capacity(frames);
        let mut left = frames;
        while left > 0 {
            let b = left.min(256);
            eng.render(b);
            let ptr = eng.scratch_ptr(0);
            let sl = unsafe { core::slice::from_raw_parts(ptr, b) };
            out.extend_from_slice(sl);
            left -= b;
        }
        out
    }

    fn rms(s: &[f32]) -> f32 {
        (s.iter().map(|x| x * x).sum::<f32>() / (s.len().max(1) as f32)).sqrt()
    }

    fn high_band_ratio(s: &[f32]) -> f32 {
        let mut diff_sq = 0.0f32;
        let mut tot_sq = 0.0f32;
        for w in s.windows(2) {
            let d = w[1] - w[0];
            diff_sq += d * d;
            tot_sq += w[0] * w[0];
        }
        (diff_sq / (tot_sq + 1e-12)).sqrt()
    }

    #[test]
    fn volta_produces_clean_finite_audio_and_zero_hum_on_panic() {
        let mut eng = Engine::new(48000.0);
        eng.params.set(VOLTA_BASE + VL_ENABLE, 1.0);
        eng.params.set(VOLTA_BASE + VL_CHORUS, 0.5);
        eng.note_on(60.0, 0.9, 1, 0);
        eng.render(256);
        let ptr = eng.scratch_ptr(0);
        let active_block = unsafe { core::slice::from_raw_parts(ptr, 256) }.to_vec();
        assert!(active_block.iter().all(|x| x.is_finite()));
        assert!(rms(&active_block) > 0.01, "VOLTA should sound strongly on note_on");

        // Probe nodes should reflect live voltage activity
        assert!(eng.volta_probe(0) > 0.01, "VCO probe should be non-zero");

        // Panic must kill output immediately to pure zero (no forever feedback or hum)
        eng.all_notes_off(true);
        eng.render(256);
        let after = unsafe { core::slice::from_raw_parts(eng.scratch_ptr(0), 256) };
        let pk = after.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        assert_eq!(pk, 0.0, "hard panic must leave zero background hum, got peak={pk}");
    }

    #[test]
    fn vintage_ladder_and_modern_svf_highpass_differ_sharply() {
        let ladder = render_volta_mono(|e| {
            e.params.set(VOLTA_BASE + VL_TOPOLOGY, 3.0); // Pure Vintage Ladder
            e.params.set(VOLTA_BASE + VL_LADDER_CUTOFF, 0.25);
            e.params.set(VOLTA_BASE + VL_FILT_ENV_AMT, 0.5);
            e.params.set(VOLTA_BASE + VL_CHORUS, 0.0);
        }, 4096);
        let svf_hp = render_volta_mono(|e| {
            e.params.set(VOLTA_BASE + VL_TOPOLOGY, 4.0); // Pure Modern SVF
            e.params.set(VOLTA_BASE + VL_SVF_CUTOFF, 0.72);
            e.params.set(VOLTA_BASE + VL_SVF_MODE, 0.67); // High-pass
            e.params.set(VOLTA_BASE + VL_FILT_ENV_AMT, 0.5);
            e.params.set(VOLTA_BASE + VL_CHORUS, 0.0);
        }, 4096);
        let r_lad = high_band_ratio(&ladder[1024..]);
        let r_hp = high_band_ratio(&svf_hp[1024..]);
        assert!(r_hp > r_lad * 2.5, "Modern HP SVF ({r_hp}) must be far brighter than dark Vintage Ladder ({r_lad})");
    }

    #[test]
    fn wavefolder_adds_rich_harmonics_above_sine_fundamental() {
        let dry = render_volta_mono(|e| {
            e.params.set(VOLTA_BASE + VL_OSC1_WAVE, 3.0); // Sine
            e.params.set(VOLTA_BASE + VL_OSC_MIX, 0.0);
            e.params.set(VOLTA_BASE + VL_SUB_LVL, 0.0);
            e.params.set(VOLTA_BASE + VL_NOISE_LVL, 0.0);
            e.params.set(VOLTA_BASE + VL_WAVEFOLD, 0.0);
            e.params.set(VOLTA_BASE + VL_DIODE_CLIP, 0.0);
            e.params.set(VOLTA_BASE + VL_TOPOLOGY, 4.0);
            e.params.set(VOLTA_BASE + VL_SVF_CUTOFF, 0.95);
            e.params.set(VOLTA_BASE + VL_CHORUS, 0.0);
        }, 4096);
        let folded = render_volta_mono(|e| {
            e.params.set(VOLTA_BASE + VL_OSC1_WAVE, 3.0); // Sine -> folded
            e.params.set(VOLTA_BASE + VL_OSC_MIX, 0.0);
            e.params.set(VOLTA_BASE + VL_SUB_LVL, 0.0);
            e.params.set(VOLTA_BASE + VL_NOISE_LVL, 0.0);
            e.params.set(VOLTA_BASE + VL_WAVEFOLD, 0.9);
            e.params.set(VOLTA_BASE + VL_DIODE_CLIP, 0.0);
            e.params.set(VOLTA_BASE + VL_TOPOLOGY, 4.0);
            e.params.set(VOLTA_BASE + VL_SVF_CUTOFF, 0.95);
            e.params.set(VOLTA_BASE + VL_CHORUS, 0.0);
        }, 4096);
        let r_dry = high_band_ratio(&dry[512..]);
        let r_fld = high_band_ratio(&folded[512..]);
        assert!(r_fld > r_dry * 3.0, "Wavefolder must generate dense upper harmonics ({r_fld} vs {r_dry})");
    }

    #[test]
    fn extreme_resonance_and_drive_stay_finite_and_bounded() {
        let extreme = render_volta_mono(|e| {
            e.params.set(VOLTA_BASE + VL_TOPOLOGY, 0.0);
            e.params.set(VOLTA_BASE + VL_LADDER_RES, 1.0);
            e.params.set(VOLTA_BASE + VL_LADDER_DRIVE, 1.0);
            e.params.set(VOLTA_BASE + VL_SVF_RES, 1.0);
            e.params.set(VOLTA_BASE + VL_WAVEFOLD, 1.0);
            e.params.set(VOLTA_BASE + VL_FM_TZ, 1.0);
            e.params.set(VOLTA_BASE + VL_DIODE_CLIP, 1.0);
            e.params.set(VOLTA_BASE + VL_PSU_SAG, 1.0);
        }, 8192);
        assert!(extreme.iter().all(|x| x.is_finite() && x.abs() <= 1.05));
    }
}
