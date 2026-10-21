// SOMA — Real-Time Multi-Physics Acoustic Percussion & Chamber Simulator (Instrument 06).
//
// Models five physically coupled acoustic wave phenomena in real time with zero heap allocations:
//   1. Biomechanical Striker / Hand / Mallet Contact & 2D Traveling-Wave Rim Reflections:
//      - Bidirectional Hunt-Crossley nonlinear contact force F_c = k * delta^alpha * (1 + b * d_delta/dt)
//      - Direct piston acceleration wavefront (monopole air compression pulse from the indenting skin)
//      - Multi-point hand/finger whip cascade (palm touchdown -> knuckle/fingertip slap micro-impacts)
//      - 2D circular membrane traveling-wave delay lines to the near rim a*(1 - r/a) and far rim a*(1 + r/a)
//        before standing Bessel eigenmodes lock in.
//   2. 16-Mode 2D Circular Membrane Solver with True Bessel Roots, Azimuthal Doublet Beating,
//      Nonlinear Von Kármán Tension Stretch, and Two-Stage (Radiation + f^2 Viscoelastic) Damping:
//      - Exact Bessel series J_m(j_{mn} r/a) nodal excitation weights
//      - Quadratic frequency-dependent viscoelastic collagen loss (sigma_1 * f_k^2) so high modes
//        deliver the woody/skin crack in the first 5..35 ms and vanish naturally instead of droning
//      - Fast initial acoustic radiation damping + nonlinear aerodynamic drag so the initial chest
//        thump drops 10..16 dB into the natural singing body resonance.
//   3. Coupled Bidirectional Tube Waveguide + Nonlinear Helmholtz Goblet Port & Sympathetic Bottom Head:
//      - Forward & backward axial pressure waveguides with mid-chamber waist impedance junction
//        (Goblet throat, Hourglass talking-drum waist, Tapered conga barrel, Sealed parabolic kettle,
//        or Deep Taiko cylinder)
//      - Nonlinear turbulent vortex shedding at the Helmholtz port exit
//      - Sympathetic bottom membrane (for Dual-Head Hourglass Talking Drum / Dundun / Bata & Taiko).
//   4. Wood / Copper / Clay Shell Wall Structural Modes & Bearing-Edge Impulse Coupling.
//   5. Directional 3-Point Acoustic Radiation (Top Batter Skin + Bottom Port/Resonant Head + Shell Body).

use core::f32::consts::TAU;
use crate::filter::tanh_fast;
use crate::osc::Rng;
use crate::params::*;

#[inline]
fn flush_denormal(x: f32) -> f32 {
    if x.abs() < 1e-20 { 0.0 } else { x }
}

#[inline]
fn soft_clip(x: f32) -> f32 {
    tanh_fast(x)
}

pub const NUM_MEMBRANE_MODES: usize = 16;
pub const NUM_SHELL_MODES: usize = 4;
const AIR_WAVEGUIDE_LEN: usize = 128;
const RIM_WAVEGUIDE_LEN: usize = 256;

/// Azimuthal index `m` for each of the 16 circular membrane eigenmodes (m, n).
const MODE_M: [u8; NUM_MEMBRANE_MODES] = [
    0, 1, 2, 0, 3, 1, 4, 2, 0, 5, 3, 6, 1, 4, 7, 2,
];

/// Radial index `n` for each of the 16 circular membrane eigenmodes (m, n).
const MODE_N: [u8; NUM_MEMBRANE_MODES] = [
    1, 1, 1, 2, 1, 2, 1, 2, 3, 1, 2, 1, 3, 2, 1, 3,
];

/// Exact zeroes j_{mn} of the Bessel functions J_m(x) = 0 for a circular membrane.
const BESSEL_ROOTS: [f32; NUM_MEMBRANE_MODES] = [
    2.404_825_6, // 0: (0,1) fundamental monopole
    3.831_706_0, // 1: (1,1) principal dipole tone
    5.135_622_3, // 2: (2,1) quadrupole
    5.520_078_1, // 3: (0,2) second axisymmetric ring
    6.380_161_9, // 4: (3,1) sextupole
    7.015_586_7, // 5: (1,2) inner dipole
    7.588_342_4, // 6: (4,1)
    8.417_244_1, // 7: (2,2)
    8.653_727_9, // 8: (0,3) third axisymmetric ring
    8.771_483_8, // 9: (5,1)
    9.761_023_1, // 10: (3,2)
    9.936_109_5, // 11: (6,1)
    10.173_468,  // 12: (1,3)
    11.064_710,  // 13: (4,2)
    11.086_370,  // 14: (7,1)
    11.619_841,  // 15: (2,3)
];

/// Orchestral Timpani air-loaded + kettle-baffled modal frequency ratios relative to (1,1).
/// The sealed copper kettle stiffens (0,1) while external air inertia aligns (1,1):(2,1):(3,1):(4,1)
/// into the quasi-harmonic timpani progression (1.00 : 1.50 : 1.99 : 2.44), while (0,2), (1,2), (2,2)
/// remain genuinely inharmonic membrane modes.
const TIMPANI_LOADED_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    0.842, // (0,1) baffled kettle hum mode
    1.000, // (1,1) principal timpani pitch
    1.502, // (2,1) fifth
    1.695, // (0,2) inharmonic axisymmetric ring
    1.992, // (3,1) octave
    2.290, // (1,2) inharmonic inner dipole
    2.440, // (4,1)
    2.815, // (2,2)
    2.910, // (0,3)
    2.895, // (5,1)
    3.310, // (3,2)
    3.345, // (6,1)
    3.520, // (1,3)
    3.830, // (4,2)
    3.790, // (7,1)
    4.060, // (2,3)
];

/// Real open/goblet/barrel air-loaded circular membrane ratios relative to (0,1).
/// Preserves true circular membrane inharmonicity (Fletcher & Rossing Ch. 18) with added air-mass
/// inertia on the lowest modes — NEVER an artificial sawtooth harmonic series.
const OPEN_DRUM_LOADED_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    1.000, // (0,1) bass fundamental (coupled to cavity Helmholtz mode)
    1.558, // (1,1) open tone principal mode (vacuum 1.593 shifted down by air mass)
    2.094, // (2,1) first slap / rim overtone (vacuum 2.135)
    2.268, // (0,2) second axisymmetric ring (vacuum 2.295)
    2.612, // (3,1) bright slap partial (vacuum 2.653)
    2.885, // (1,2) (vacuum 2.917)
    3.118, // (4,1) (vacuum 3.155)
    3.465, // (2,2) (vacuum 3.500)
    3.568, // (0,3) (vacuum 3.598)
    3.615, // (5,1)
    4.025, // (3,2)
    4.102, // (6,1)
    4.198, // (1,3)
    4.568, // (4,2)
    4.582, // (7,1)
    4.805, // (2,3)
];

/// Relative acoustic radiation efficiency per mode: axisymmetric (m=0) and dipole (m=1) modes
/// displace large net air volumes and therefore radiate strongly AND damp rapidly via radiation loss.
const MODE_RAD_EFFICIENCY: [f32; NUM_MEMBRANE_MODES] = [
    1.00, // (0,1) monopole — maximum air volume displacement
    0.72, // (1,1) dipole — strong principal tone radiation
    0.42, // (2,1) quadrupole
    0.68, // (0,2) axisymmetric ring
    0.30, // (3,1)
    0.38, // (1,2)
    0.22, // (4,1)
    0.26, // (2,2)
    0.45, // (0,3)
    0.18, // (5,1)
    0.20, // (3,2)
    0.15, // (6,1)
    0.24, // (1,3)
    0.14, // (4,2)
    0.12, // (7,1)
    0.13, // (2,3)
];

/// Evaluates the Bessel function of the first kind J_m(x) via its alternating power series.
#[inline]
pub fn bessel_j(m: u8, x: f32) -> f32 {
    let x = x.max(0.0);
    if x < 1e-6 {
        return if m == 0 { 1.0 } else { 0.0 };
    }
    let half_x = 0.5 * x;
    let neg_quarter_x2 = -half_x * half_x;

    let mut term = 1.0f32;
    for k in 1..=(m as u32) {
        term *= half_x / (k as f32);
    }

    let mut sum = term;
    for s in 1..=16u32 {
        term *= neg_quarter_x2 / ((s * (s + m as u32)) as f32);
        sum += term;
        if term.abs() < 1e-7 * sum.abs() {
            break;
        }
    }
    sum
}

pub struct SomaVoice {
    sample_rate: f32,
    inv_sr: f32,

    // ── Domain I: Biomechanical Striker / Hand Contact & 2D Traveling Wavefront ──
    striker_active: bool,
    striker_z: f32,
    striker_v: f32,
    striker_mass: f32,
    striker_stiffness: f32,
    striker_exponent: f32,
    striker_hysteresis: f32,
    striker_type: u8,
    prev_contact_force: f32,

    /// Secondary finger-whip delayed micro-impact (for Open Hand, Hand Slap, and Finger strikes)
    whip_delay_samples: u32,
    whip_env: f32,
    whip_freq_hz: f32,
    whip_bp_z1: f32,
    whip_bp_z2: f32,

    /// Skin-to-flesh friction & air-pocket pop state
    brush_env: f32,
    slap_pop_env: f32,
    slap_bp_z1: f32,
    slap_bp_z2: f32,
    muted_touch_damp: f32,

    /// 2D Membrane radial traveling-wave delay line (strike point -> near rim & far rim -> bearing edge)
    rim_wave_buf: [f32; RIM_WAVEGUIDE_LEN],
    rim_write_idx: usize,
    near_rim_delay: usize,
    far_rim_delay: usize,
    rim_lp_state: f32,

    // ── Domain II: 16-Mode 2D Bessel Circular Membrane + Azimuthal Doublets ──
    base_freq_hz: f32,
    strike_pos: f32,
    strike_angle: f32,
    spatial_weight: [f32; NUM_MEMBRANE_MODES],
    mode_pan: [f32; NUM_MEMBRANE_MODES],
    mode_ratio: [f32; NUM_MEMBRANE_MODES],
    /// Per-sample steady viscoelastic + rim damping per mode
    mode_damp: [f32; NUM_MEMBRANE_MODES],
    /// Extra fast initial acoustic radiation damping coefficient per mode
    mode_rad_loss: [f32; NUM_MEMBRANE_MODES],
    /// Primary modal displacement w_k and velocity v_k
    mode_w: [f32; NUM_MEMBRANE_MODES],
    mode_v: [f32; NUM_MEMBRANE_MODES],
    /// Degenerate orthogonal doublet states for (1,1), (2,1), (3,1) natural skin anisotropy beating
    doublet_w: [f32; 3],
    doublet_v: [f32; 3],
    /// Macroscopic impact tension envelope + instantaneous Von Kármán strain energy
    impact_tension_env: f32,
    impact_tension_decay: f32,
    radiation_burst_env: f32,
    deflection_energy: f32,
    pedal_ratio_smooth: f32,

    cached_air_load: f32,
    cached_decay: f32,
    cached_damp_hf: f32,
    cached_cavity_type: f32,
    cached_cavity_vol: f32,
    cached_skin_mat: f32,

    /// Sympathetic snare / Sega ring / Bendir gut state
    buzz_env: f32,
    buzz_z1: f32,
    buzz_z2: f32,

    // ── Domain III: Bidirectional Tube Waveguide + Helmholtz Port + Bottom Head ──
    /// Downward & upward axial acoustic pressure waves inside the shell
    air_down: [f32; AIR_WAVEGUIDE_LEN],
    air_up: [f32; AIR_WAVEGUIDE_LEN],
    air_write_idx: usize,
    air_port_lp: f32,
    /// Inertance-compliance Helmholtz air plug in goblet neck / kettle bowl
    cavity_w: f32,
    cavity_v: f32,
    /// Sympathetic bottom resonant head (Hourglass Talking Drum / Dundun & Taiko)
    res_head_w: f32,
    res_head_v: f32,

    // ── Domain IV: Wood / Copper / Clay Shell Wall Structural Modes & Radiation ──
    shell_w: [f32; NUM_SHELL_MODES],
    shell_v: [f32; NUM_SHELL_MODES],
    early_buf_l: [f32; 64],
    early_buf_r: [f32; 64],
    early_idx: usize,
    dc_x1_l: f32,
    dc_y1_l: f32,
    dc_x1_r: f32,
    dc_y1_r: f32,
}

impl SomaVoice {
    pub fn new(sample_rate: f32) -> Self {
        let sr = sample_rate.max(8000.0);
        Self {
            sample_rate: sr,
            inv_sr: 1.0 / sr,
            striker_active: false,
            striker_z: 0.0,
            striker_v: 0.0,
            striker_mass: 0.015,
            striker_stiffness: 1e4,
            striker_exponent: 2.2,
            striker_hysteresis: 0.15,
            striker_type: 0,
            prev_contact_force: 0.0,
            whip_delay_samples: 0,
            whip_env: 0.0,
            whip_freq_hz: 1800.0,
            whip_bp_z1: 0.0,
            whip_bp_z2: 0.0,
            brush_env: 0.0,
            slap_pop_env: 0.0,
            slap_bp_z1: 0.0,
            slap_bp_z2: 0.0,
            muted_touch_damp: 0.0,
            rim_wave_buf: [0.0; RIM_WAVEGUIDE_LEN],
            rim_write_idx: 0,
            near_rim_delay: 12,
            far_rim_delay: 48,
            rim_lp_state: 0.0,
            base_freq_hz: 110.0,
            strike_pos: 0.62,
            strike_angle: 0.5,
            spatial_weight: [0.0; NUM_MEMBRANE_MODES],
            mode_pan: [0.0; NUM_MEMBRANE_MODES],
            mode_ratio: [1.0; NUM_MEMBRANE_MODES],
            mode_damp: [0.995; NUM_MEMBRANE_MODES],
            mode_rad_loss: [0.002; NUM_MEMBRANE_MODES],
            mode_w: [0.0; NUM_MEMBRANE_MODES],
            mode_v: [0.0; NUM_MEMBRANE_MODES],
            doublet_w: [0.0; 3],
            doublet_v: [0.0; 3],
            impact_tension_env: 0.0,
            impact_tension_decay: 0.999,
            radiation_burst_env: 0.0,
            deflection_energy: 0.0,
            pedal_ratio_smooth: 1.0,
            cached_air_load: -1.0,
            cached_decay: -1.0,
            cached_damp_hf: -1.0,
            cached_cavity_type: -1.0,
            cached_cavity_vol: -1.0,
            cached_skin_mat: -1.0,
            buzz_env: 0.0,
            buzz_z1: 0.0,
            buzz_z2: 0.0,
            air_down: [0.0; AIR_WAVEGUIDE_LEN],
            air_up: [0.0; AIR_WAVEGUIDE_LEN],
            air_write_idx: 0,
            air_port_lp: 0.0,
            cavity_w: 0.0,
            cavity_v: 0.0,
            res_head_w: 0.0,
            res_head_v: 0.0,
            shell_w: [0.0; NUM_SHELL_MODES],
            shell_v: [0.0; NUM_SHELL_MODES],
            early_buf_l: [0.0; 64],
            early_buf_r: [0.0; 64],
            early_idx: 0,
            dc_x1_l: 0.0,
            dc_y1_l: 0.0,
            dc_x1_r: 0.0,
            dc_y1_r: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
        self.inv_sr = 1.0 / self.sample_rate;
    }

    pub fn reset(&mut self) {
        self.striker_active = false;
        self.striker_z = 0.0;
        self.striker_v = 0.0;
        self.prev_contact_force = 0.0;
        self.whip_env = 0.0;
        self.brush_env = 0.0;
        self.slap_pop_env = 0.0;
        self.rim_wave_buf = [0.0; RIM_WAVEGUIDE_LEN];
        self.rim_lp_state = 0.0;
        self.mode_w = [0.0; NUM_MEMBRANE_MODES];
        self.mode_v = [0.0; NUM_MEMBRANE_MODES];
        self.doublet_w = [0.0; 3];
        self.doublet_v = [0.0; 3];
        self.impact_tension_env = 0.0;
        self.radiation_burst_env = 0.0;
        self.deflection_energy = 0.0;
        self.air_down = [0.0; AIR_WAVEGUIDE_LEN];
        self.air_up = [0.0; AIR_WAVEGUIDE_LEN];
        self.air_port_lp = 0.0;
        self.cavity_w = 0.0;
        self.cavity_v = 0.0;
        self.res_head_w = 0.0;
        self.res_head_v = 0.0;
        self.shell_w = [0.0; NUM_SHELL_MODES];
        self.shell_v = [0.0; NUM_SHELL_MODES];
    }

    #[inline]
    pub fn is_quiet(&self) -> bool {
        if self.striker_active || self.whip_delay_samples > 0 {
            return false;
        }
        let mut e = self.cavity_w * self.cavity_w
            + self.cavity_v * self.cavity_v
            + self.res_head_w * self.res_head_w
            + self.res_head_v * self.res_head_v;
        for k in 0..NUM_MEMBRANE_MODES {
            e += self.mode_w[k] * self.mode_w[k] + self.mode_v[k] * self.mode_v[k];
        }
        e < 1e-9
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, params: &Params, rng: &mut Rng) {
        // Retain 18% of existing membrane energy on re-strike so rapid rolls build naturally without mud
        for k in 0..NUM_MEMBRANE_MODES {
            self.mode_w[k] *= 0.18;
            self.mode_v[k] *= 0.18;
        }
        for d in 0..3 {
            self.doublet_w[d] *= 0.18;
            self.doublet_v[d] *= 0.18;
        }

        let vel = velocity.clamp(0.02, 1.0);
        let keytrack = params.get(SOMA_BASE + SM_KEYTRACK).clamp(0.0, 1.0);
        let diameter_norm = params.get(SOMA_BASE + SM_HEAD_DIAMETER).clamp(0.0, 1.0);

        // Physical head diameter in meters: 0.15 m (6" bongo) .. 0.91 m (36" concert/timpani)
        let radius_m = 0.075 + 0.38 * diameter_norm;
        // Natural membrane reference pitch from physical diameter (6" Bongo ~260 Hz down to 36" Bass/Timpani ~52 Hz)
        let natural_hz = 260.0 * (0.20f32).powf(diameter_norm);
        self.base_freq_hz = (natural_hz * (note_hz / natural_hz).powf(keytrack)).clamp(24.0, 1200.0);

        let striker_type = (params.get(SOMA_BASE + SM_STRIKER_TYPE).round() as i32).clamp(0, 5) as u8;
        self.striker_type = striker_type;

        let hardness_param = params.get(SOMA_BASE + SM_STRIKER_HARDNESS).clamp(0.0, 1.0);
        let vel_hardness = params.get(SOMA_BASE + SM_VEL_HARDNESS).clamp(0.0, 1.0);
        let eff_hardness = (hardness_param + vel_hardness * (vel - 0.30) * 0.70).clamp(0.03, 1.0);

        let mass_param = params.get(SOMA_BASE + SM_STRIKER_MASS).clamp(0.0, 1.0);
        let pos_param = params.get(SOMA_BASE + SM_STRIKE_POS).clamp(0.0, 0.95);
        let jitter = rng.bipolar() * 0.005 * pos_param;
        let rho = (pos_param + jitter).clamp(0.0, 0.95);
        self.strike_pos = rho;
        self.strike_angle = params.get(SOMA_BASE + SM_STRIKE_ANGLE).clamp(0.0, 1.0);

        // 2D Membrane wave speed c_m = 2 * pi * a * f_01 / j_01 (m/s)
        let wave_speed_mps = (TAU * radius_m * self.base_freq_hz / BESSEL_ROOTS[0]).clamp(35.0, 320.0);
        let near_dist_m = radius_m * (1.0 - rho).max(0.04);
        let far_dist_m = radius_m * (1.0 + rho);
        self.near_rim_delay = ((near_dist_m / wave_speed_mps) * self.sample_rate)
            .clamp(3.0, (RIM_WAVEGUIDE_LEN - 4) as f32) as usize;
        self.far_rim_delay = ((far_dist_m / wave_speed_mps) * self.sample_rate)
            .clamp(8.0, (RIM_WAVEGUIDE_LEN - 2) as f32) as usize;

        // Hunt-Crossley contact mechanics by striker archetype:
        // (footprint_radius, alpha, mass, stiffness_scale, post_strike_palm_damping)
        let (footprint_radius, exp_alpha, base_mass, stiff_scale, touch_damp) = match striker_type {
            // 0 = Felt Mallet (Orchestral Timpani / Concert Bass Drum — wool felt core over hardwood)
            0 => (0.105 - 0.055 * eff_hardness, 2.25, 0.72 + 0.95 * mass_param, 2.6, 0.0),
            // 1 = Open Hand (Djembe / Conga Open Tone — hand rebounds cleanly off the skin!)
            1 => (0.095 - 0.040 * eff_hardness, 2.15, 0.65 + 0.85 * mass_param, 3.2, 0.0),
            // 2 = Hand Slap / Pop (Claqué / Seco — palm grazes center while fingers whip the rim)
            2 => (0.032 - 0.015 * eff_hardness, 2.75, 0.24 + 0.30 * mass_param, 8.5, 0.0),
            // 3 = Muted / Pressed Hand (Tapón — palm stays pressed into the drumhead to choke sustain)
            3 => (0.135, 2.10, 0.85 + 1.10 * mass_param, 3.4, 0.00085 + 0.0012 * mass_param),
            // 4 = Curved Stick / Bachi (Yoruba GanGan Talking Drum / Dundun / Taiko hardwood bachi)
            4 => (0.028 - 0.012 * eff_hardness, 2.65, 0.30 + 0.42 * mass_param, 9.2, 0.0),
            // 5 = Finger / Rim Articulation (Darbuka Tek/Ka, Bongo Martillo, Tabla Na fingertip)
            _ => (0.022 - 0.010 * eff_hardness, 2.55, 0.20 + 0.30 * mass_param, 7.8, 0.0),
        };

        self.striker_active = true;
        self.striker_z = 0.0; // starts at surface contact (z = 0) so force rises smoothly to physical compression peak
        self.striker_v = (0.95 + 2.35 * vel.powf(0.80)) * (1.25 - 0.32 * mass_param);
        self.striker_mass = base_mass;
        self.striker_exponent = exp_alpha;
        self.striker_stiffness = stiff_scale * (1.8 * (10.0f32).powf(eff_hardness));
        self.striker_hysteresis = 0.22 + 0.28 * (1.0 - eff_hardness);
        self.muted_touch_damp = touch_damp;
        self.prev_contact_force = 0.0;

        // Biomechanical finger-whip secondary micro-impact (1.1 ms .. 2.4 ms after initial palm contact)
        let brush_amt = params.get(SOMA_BASE + SM_HAND_BRUSH).clamp(0.0, 1.0);
        match striker_type {
            2 => {
                // Hand Slap (Claqué / Seco): explosive whip-crack 1.3 ms after palm grazing
                self.whip_delay_samples = (0.0013 * self.sample_rate) as u32;
                self.whip_env = vel * (0.95 + 0.45 * eff_hardness);
                self.whip_freq_hz = 1650.0 + 1150.0 * eff_hardness;
            }
            1 | 3 => {
                // Open / Muted Hand: phalanges slap down 1.8 ms after palm heel
                self.whip_delay_samples = (0.0018 * self.sample_rate) as u32;
                self.whip_env = vel * (0.42 + 0.35 * brush_amt);
                self.whip_freq_hz = 1050.0 + 750.0 * eff_hardness;
            }
            4 | 5 => {
                // Stick / Finger rim snap
                self.whip_delay_samples = (0.0006 * self.sample_rate) as u32;
                self.whip_env = vel * (0.55 + 0.35 * eff_hardness);
                self.whip_freq_hz = 2100.0 + 1100.0 * eff_hardness;
            }
            _ => {
                // Felt Mallet core compression transient
                self.whip_delay_samples = (0.0011 * self.sample_rate) as u32;
                self.whip_env = vel * 0.25 * eff_hardness;
                self.whip_freq_hz = 680.0 + 620.0 * eff_hardness;
            }
        }

        self.brush_env = vel * (0.30 + 0.70 * brush_amt);
        self.slap_pop_env = if striker_type == 2 {
            vel * (0.95 + 0.40 * eff_hardness)
        } else if striker_type == 1 || striker_type == 3 || striker_type == 5 {
            vel * (0.35 + 0.35 * brush_amt)
        } else {
            vel * (0.18 + 0.22 * eff_hardness)
        };

        // Initial nonlinear impact tension envelope (models the macroscopic indentation stretch of the skin
        // during the first 25..75 ms after strike — critical for authentic percussive pitch drop!)
        let nonlin_amt = params.get(SOMA_BASE + SM_TENSION_NONLIN).clamp(0.0, 1.0);
        let center_focus = 1.0 - 0.45 * rho;
        self.impact_tension_env = vel.powf(1.1) * (0.18 + 0.62 * nonlin_amt) * center_focus;
        let tension_glide_tau = 0.026 + 0.038 * diameter_norm; // 26 ms (small drums) .. 64 ms (large timpani/taiko)
        self.impact_tension_decay = (-self.inv_sr / tension_glide_tau).exp();

        // Fast initial radiation burst envelope (models high-SPL acoustic radiation damping in first 45 ms)
        self.radiation_burst_env = 1.0;

        // Compute exact 2D Bessel spatial excitation weights W_k = J_m(j_{mn} * rho) * footprint_filter
        let azimuth_rad = (self.strike_angle - 0.5) * core::f32::consts::PI;
        for k in 0..NUM_MEMBRANE_MODES {
            let m = MODE_M[k];
            let j_mn = BESSEL_ROOTS[k];
            let bessel_val = bessel_j(m, j_mn * rho);
            let footprint_atten = (-0.42 * (j_mn * footprint_radius).powi(2)).exp();

            // Slap articulation (type 2): the heel of the hand rests near r/a ~ 0.35 to damp (0,1) & (1,1)
            // while the fingers whip the outer rim, exciting (2,1), (3,1), (4,1) with high intensity!
            let articulation_tilt = match striker_type {
                2 => {
                    if k == 0 {
                        0.12
                    } else if k == 1 {
                        0.38
                    } else if m >= 2 {
                        1.75
                    } else {
                        0.85
                    }
                }
                3 => {
                    // Muted hand (Tapón): heavy central palm suppresses sustained lower ring, emphasizes woody knock
                    if k == 0 { 0.35 } else if k <= 2 { 0.55 } else { 0.90 }
                }
                5 => {
                    // Finger / Rim Tek: strong edge modes
                    if k == 0 { 0.22 } else if m >= 1 { 1.35 } else { 0.75 }
                }
                _ => 1.0,
            };

            self.spatial_weight[k] = bessel_val * footprint_atten * articulation_tilt;

            let pan_dir = if m == 0 {
                0.0
            } else {
                ((m as f32) * azimuth_rad + (k as f32) * 0.65).sin() * (0.35 + 0.45 * rho)
            };
            self.mode_pan[k] = pan_dir.clamp(-0.85, 0.85);
        }

        let pedal_norm = params.get(SOMA_BASE + SM_TENSION_PEDAL).clamp(0.0, 1.0);
        let pedal_semis = (pedal_norm - 0.5) * 24.0;
        self.pedal_ratio_smooth = (2.0f32).powf(pedal_semis / 12.0);

        self.recompute_modal_structure(params);
    }

    /// Updates modal frequency ratios and two-stage physical damping (Radiation + f^2 Viscoelastic Hide Loss).
    #[inline]
    fn recompute_modal_structure(&mut self, params: &Params) {
        let air_load = params.get(SOMA_BASE + SM_AIR_LOAD).clamp(0.0, 1.0);
        let cavity_type = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5);
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.0, 1.0);
        let skin_mat = (params.get(SOMA_BASE + SM_SKIN_MATERIAL).round() as i32).clamp(0, 5);
        let decay_norm = params.get(SOMA_BASE + SM_MEMBRANE_DECAY).clamp(0.0, 1.0);
        let damp_hf = params.get(SOMA_BASE + SM_MEMBRANE_DAMP_HF).clamp(0.0, 1.0);

        self.cached_air_load = air_load;
        self.cached_decay = decay_norm;
        self.cached_damp_hf = damp_hf;
        self.cached_cavity_type = cavity_type as f32;
        self.cached_cavity_vol = cavity_vol;
        self.cached_skin_mat = skin_mat as f32;

        // Skin material properties:
        // (bending_stiff_disp, quadratic_viscoelastic_loss, t60_scale)
        let (mat_stiff_disp, mat_visc_f2, mat_t60_scale) = match skin_mat {
            0 => (0.0014, 0.75, 1.15), // Calfskin / Vellum (Timpani — clear principal tone, controlled upper modes)
            1 => (0.0024, 1.35, 0.78), // Thick Goat Skin (Djembe / Bata — punchy, rapid upper-mode skin damping)
            2 => (0.0010, 0.80, 0.90), // Thin Goat Skin (Talking Drum / Darbuka — articulate singing tone)
            3 => (0.0036, 1.65, 0.72), // Thick Rawhide / Mule (Conga / Bongo — warm woody fundamental, tight ring)
            4 => (0.0045, 1.40, 1.05), // Heavy Cowhide (Taiko — thunderous low fundamental, fast upper roll-off)
            _ => (0.0008, 0.65, 0.95), // Mylar / Synthetic
        };

        // Chamber-specific decay scaling: hand drums (Goblet, Barrel, Frame) have shorter natural T60
        // than a 29" copper-kettle orchestral timpani or 40" O-Daiko.
        let chamber_t60_scale = match cavity_type {
            0 => 1.25, // Sealed Parabolic Kettle (Timpani: ~1.3s..1.8s T60)
            1 => 0.68, // Goblet Helmholtz (Djembe / Darbuka: ~0.40s..0.55s T60)
            2 => 0.62, // Tapered Stave Barrel (Conga / Tumba / Bongo: ~0.36s..0.48s T60)
            3 => 0.78, // Hourglass Dual-Head (Talking Drum / Dundun: ~0.50s..0.75s T60)
            4 => 1.10, // Deep Taiko Barrel (~0.95s..1.4s T60)
            _ => 0.72, // Shallow Frame Hoop (Bodhrán / Bendir)
        };

        // Fundamental T60 in seconds:
        // At decay_norm = 0.50 (Djembe/Conga): base_t60 ~ 0.42s..0.48s (-60 dB in 450 ms -> -11 dB at 80 ms, -27 dB at 200 ms)
        // At decay_norm = 0.72 (Timpani): base_t60 ~ 1.45s (-60 dB in 1.45s -> -25 dB at 500 ms, -42 dB at 1.0s)
        let base_t60 = (0.08 + 1.85 * decay_norm.powf(1.8)) * mat_t60_scale * chamber_t60_scale;

        let ref_k = if cavity_type == 0 { 1usize } else { 0usize };
        let ref_stiff = (1.0 + mat_stiff_disp * (ref_k as f32) * (ref_k as f32)).sqrt();

        for k in 0..NUM_MEMBRANE_MODES {
            let vac_ratio = BESSEL_ROOTS[k] / BESSEL_ROOTS[0];
            let loaded_target = if cavity_type == 0 {
                let mut r = TIMPANI_LOADED_RATIOS[k];
                if k == 0 {
                    r *= 1.0 + 0.22 * (0.65 - cavity_vol);
                }
                r
            } else {
                OPEN_DRUM_LOADED_RATIOS[k]
            };

            let vac_ref = if cavity_type == 0 {
                BESSEL_ROOTS[k] / BESSEL_ROOTS[1]
            } else {
                vac_ratio
            };
            let base_r = vac_ref + (loaded_target - vac_ref) * air_load;
            let stiff_factor = (1.0 + mat_stiff_disp * (k as f32) * (k as f32)).sqrt() / ref_stiff;
            let ratio = base_r * stiff_factor;
            self.mode_ratio[k] = ratio;

            // QUADRATIC frequency-dependent viscoelastic loss above the (1,1) principal tone:
            // Modes (0,1) and (1,1) are the primary musical foundation of the drum (Doum/Bass & Open Tone);
            // modes above (1,1) experience Kelvin-Voigt collagen damping proportional to (ratio - 1.55)^2.
            let overtone_excess = (ratio - 1.55).max(0.0);
            let radial_n_penalty = ((MODE_N[k].saturating_sub(1)) as f32) * 1.35;
            let visc_factor = 1.0
                + (0.65 + 2.8 * damp_hf) * mat_visc_f2 * (overtone_excess * overtone_excess * 0.85 + radial_n_penalty);

            // Sealed kettle baffles the (0,1) monopole mode because there is no bottom vent hole
            let kettle_monopole_baffle = if cavity_type == 0 && k == 0 { 2.6 } else { 1.0 };
            // Slap articulation (striker_type == 2) damps (0,1) and (1,1) with the palm heel
            let slap_palm_clamp = if self.striker_type == 2 {
                if k == 0 { 5.0 } else if k == 1 { 3.5 } else { 1.8 }
            } else if self.striker_type == 3 {
                // Muted hand (Tapón) chokes all lower modes rapidly (T60 ~ 75..105 ms)
                5.2
            } else {
                1.0
            };

            let mode_t60 = (base_t60 / (visc_factor * kettle_monopole_baffle * slap_palm_clamp)).max(0.006);
            let damp_per_sec = 6.907_755 / mode_t60;

            let touch_loss = self.muted_touch_damp
                * (0.45 + 0.55 * self.spatial_weight[k].abs())
                * self.sample_rate;

            self.mode_damp[k] = (-(damp_per_sec + touch_loss) * self.inv_sr).exp();

            // Fast initial acoustic radiation damping rate during the first 30 ms
            let rad_eff = MODE_RAD_EFFICIENCY[k];
            let rad_rate = (3.0 + 5.5 * air_load) * rad_eff;
            self.mode_rad_loss[k] = (rad_rate * self.inv_sr).min(0.0006);
        }
    }

    #[inline]
    pub fn render_sample(
        &mut self,
        params: &Params,
        pitch_bend_ratio: f32,
        mod_wheel: f32,
        rng: &mut Rng,
    ) -> (f32, f32) {
        // 1. Live Tension Pedal & Talking-Drum Cord Squeeze Modulation
        let pedal_norm = params.get(SOMA_BASE + SM_TENSION_PEDAL).clamp(0.0, 1.0);
        let pedal_semis = (pedal_norm - 0.5) * 24.0 + mod_wheel * 7.0;
        let target_pedal_ratio = (2.0f32).powf(pedal_semis / 12.0) * pitch_bend_ratio;
        self.pedal_ratio_smooth += (target_pedal_ratio - self.pedal_ratio_smooth) * 0.008;

        let decay_norm = params.get(SOMA_BASE + SM_MEMBRANE_DECAY).clamp(0.0, 1.0);
        let damp_hf = params.get(SOMA_BASE + SM_MEMBRANE_DAMP_HF).clamp(0.0, 1.0);
        let air_load = params.get(SOMA_BASE + SM_AIR_LOAD).clamp(0.0, 1.0);
        let cavity_type = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5) as f32;
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.0, 1.0);
        let skin_mat = (params.get(SOMA_BASE + SM_SKIN_MATERIAL).round() as i32).clamp(0, 5) as f32;

        if (decay_norm - self.cached_decay).abs() > 1e-4
            || (damp_hf - self.cached_damp_hf).abs() > 1e-4
            || (air_load - self.cached_air_load).abs() > 1e-4
            || (cavity_type - self.cached_cavity_type).abs() > 1e-4
            || (cavity_vol - self.cached_cavity_vol).abs() > 1e-4
            || (skin_mat - self.cached_skin_mat).abs() > 1e-4
        {
            self.recompute_modal_structure(params);
        }

        // 2. Instantaneous membrane displacement & velocity under the striker footprint
        let mut head_disp_at_strike = 0.0f32;
        let mut head_vel_at_strike = 0.0f32;
        for k in 0..NUM_MEMBRANE_MODES {
            let wk = self.spatial_weight[k];
            head_disp_at_strike += wk * self.mode_w[k];
            head_vel_at_strike += wk * self.mode_v[k];
        }

        // 3. Domain I: Bidirectional Hunt-Crossley Striker / Hand Contact Force
        let dt_ms = 1000.0 * self.inv_sr;
        let mut contact_force = 0.0f32;
        if self.striker_active {
            let penetration = self.striker_z - head_disp_at_strike * 0.18;
            if penetration > 0.0 {
                let rel_vel = self.striker_v - head_vel_at_strike * 0.18;
                let hyst = (1.0 + self.striker_hysteresis * rel_vel).max(0.05);
                contact_force = (self.striker_stiffness * penetration.powf(self.striker_exponent) * hyst)
                    .min(24.0);
                self.striker_v -= (contact_force / self.striker_mass) * dt_ms;
                self.striker_z += self.striker_v * dt_ms;
            } else {
                self.striker_z += self.striker_v * dt_ms;
                if self.striker_z < -0.01 && self.striker_v <= 0.0 {
                    self.striker_active = false;
                }
            }
        }

        // Direct piston acceleration impulse (the immediate acoustic compression wavefront launched
        // into the air as the mallet/hand decelerates into the drumhead)
        let force_deriv = contact_force - self.prev_contact_force;
        self.prev_contact_force = contact_force;
        let direct_piston_wave = (force_deriv * 0.24 + contact_force * 0.028).clamp(-0.95, 0.95);

        // Secondary finger-whip / slap micro-impact (fires 0.6..1.8 ms after initial palm contact)
        let mut whip_wave = 0.0f32;
        if self.whip_delay_samples > 0 {
            self.whip_delay_samples -= 1;
        } else if self.whip_env > 1e-5 {
            let white = rng.bipolar();
            let f_whip = (TAU * self.whip_freq_hz * self.inv_sr).min(0.82);
            let hp = white - self.whip_bp_z2 - 0.32 * self.whip_bp_z1;
            self.whip_bp_z1 = flush_denormal(self.whip_bp_z1 + f_whip * hp);
            self.whip_bp_z2 = flush_denormal(self.whip_bp_z2 + f_whip * self.whip_bp_z1);
            whip_wave = (self.whip_bp_z1 * 0.85 + hp * 0.35) * self.whip_env * 0.45;
            // Fast 1.8 ms whip decay
            self.whip_env = flush_denormal(self.whip_env * (-1.0 / (0.0018 * self.sample_rate)).exp());
        }

        // Turbulent hand-slap air pocket pop & skin friction transient
        let mut transient_force = 0.0f32;
        if self.slap_pop_env > 1e-5 || self.brush_env > 1e-5 {
            let white = rng.bipolar();
            let slap_fc = if self.striker_type == 2 {
                2350.0
            } else if self.striker_type == 4 || self.striker_type == 5 {
                1950.0
            } else {
                980.0
            };
            let f_svf = (TAU * slap_fc * self.inv_sr).min(0.78);
            let hp = white - self.slap_bp_z2 - 0.42 * self.slap_bp_z1;
            self.slap_bp_z1 = flush_denormal(self.slap_bp_z1 + f_svf * hp);
            self.slap_bp_z2 = flush_denormal(self.slap_bp_z2 + f_svf * self.slap_bp_z1);

            transient_force = self.slap_bp_z1 * self.slap_pop_env * 0.35
                + white * self.brush_env * 0.12
                + whip_wave * 0.65;
            self.slap_pop_env = flush_denormal(self.slap_pop_env * (-1.0 / (0.0022 * self.sample_rate)).exp());
            self.brush_env = flush_denormal(self.brush_env * (-1.0 / (0.0045 * self.sample_rate)).exp());
        }

        // 4. 2D Membrane Traveling-Wave Rim Reflection Waveguide
        // Launches the impact wavefront outward from strike_pos to the near & far wooden/copper rim.
        let near_idx = (self.rim_write_idx + RIM_WAVEGUIDE_LEN - self.near_rim_delay) % RIM_WAVEGUIDE_LEN;
        let far_idx = (self.rim_write_idx + RIM_WAVEGUIDE_LEN - self.far_rim_delay) % RIM_WAVEGUIDE_LEN;
        let near_rim_hit = self.rim_wave_buf[near_idx];
        let far_rim_hit = self.rim_wave_buf[far_idx];
        let rim_refl = -0.46 * near_rim_hit - 0.28 * far_rim_hit;
        self.rim_lp_state = flush_denormal(self.rim_lp_state + 0.42 * (rim_refl - self.rim_lp_state));

        let outgoing_wavefront = direct_piston_wave * 0.55 + transient_force * 0.45 + self.rim_lp_state * 0.22;
        self.rim_wave_buf[self.rim_write_idx] = flush_denormal(outgoing_wavefront);
        self.rim_write_idx = (self.rim_write_idx + 1) % RIM_WAVEGUIDE_LEN;

        // Calibrated modal force scale so mode_v stays in linear acoustic range (~0.15..0.35) and NEVER
        // brickwall-clips against the engine's output tanh limiter!
        let total_exciter_force = contact_force * 0.095 + transient_force * 0.45 + self.rim_lp_state * 0.18;

        // 5. Physical Nonlinear Tension Pitch Glide (Macroscopic Indentation Stretch + Von Kármán Strain)
        let nonlin_amt = params.get(SOMA_BASE + SM_TENSION_NONLIN).clamp(0.0, 1.0);
        self.impact_tension_env = flush_denormal(self.impact_tension_env * self.impact_tension_decay);
        self.radiation_burst_env = flush_denormal(self.radiation_burst_env * (-self.inv_sr / 0.038).exp());

        let strain_stretch = (self.deflection_energy * 6.5).tanh() * 0.18 * nonlin_amt;
        let tension_stretch = 1.0 + self.impact_tension_env * 0.42 + strain_stretch;

        // 6. Coupled Cavity Adiabatic Air-Spring Stiffness acting on Axisymmetric (m = 0) modes
        // Models P * V^gamma = const pneumatic stiffness modulation without positive velocity feedback
        let cavity_coupling = params.get(SOMA_BASE + SM_CAVITY_COUPLING).clamp(0.0, 1.0);
        let adiabatic_stiff = (1.0 + self.cavity_w * cavity_coupling * 0.035).clamp(0.88, 1.14);

        // 7. Domain II: Step all 16 2D Bessel Circular Membrane Eigenmodes + Azimuthal Doublets
        let inst_base_hz = self.base_freq_hz * self.pedal_ratio_smooth * tension_stretch;
        let nyquist_guard = self.sample_rate * 0.44;

        let mut top_skin_l = 0.0f32;
        let mut top_skin_r = 0.0f32;
        let mut axisym_vol_vel = 0.0f32;
        let mut rim_shear_force = near_rim_hit * 0.85 + far_rim_hit * 0.55;
        let mut weighted_strain_energy = 0.0f32;

        // Nonlinear mode-to-mode Von Kármán parametric coupling from (0,1) + (1,1) strain into upper modes
        let low_mode_strain = (self.mode_w[0] + 0.65 * self.mode_w[1]).clamp(-1.5, 1.5) * nonlin_amt * 0.006;

        for k in 0..NUM_MEMBRANE_MODES {
            let mode_stiff = if k == 0 {
                adiabatic_stiff
            } else if k == 3 {
                1.0 + (adiabatic_stiff - 1.0) * 0.35
            } else {
                1.0
            };
            let mode_hz = (inst_base_hz * self.mode_ratio[k] * mode_stiff).min(nyquist_guard);
            let omega = (TAU * mode_hz * self.inv_sr).min(1.85);

            // Von Kármán inter-mode energy transfer excites upper modes during initial impact deflection
            let intermode_drive = if k >= 2 {
                low_mode_strain * self.mode_v[k - 1] * self.radiation_burst_env
            } else {
                0.0
            };

            let f_mode = total_exciter_force * self.spatial_weight[k] * 0.065 + intermode_drive;

            // Two-stage damping: steady viscoelastic/rim damping + fast initial acoustic radiation loss
            let rad_loss = self.mode_rad_loss[k] * self.radiation_burst_env;
            let eff_damp = (self.mode_damp[k] * (1.0 - rad_loss)).clamp(0.92, 0.99998);

            // Apply damping to BOTH v and w so amplitude decays at the exact physical T60 rate
            let mut v = (self.mode_v[k] - omega * self.mode_w[k]) * eff_damp + f_mode;
            let mut w = self.mode_w[k] * eff_damp + omega * v;
            v = flush_denormal(v);
            w = flush_denormal(w);
            self.mode_v[k] = v;
            self.mode_w[k] = w;

            // Areal strain contribution proportional to j_{mn}^2 * w_k^2
            let j_norm = BESSEL_ROOTS[k] * (1.0 / BESSEL_ROOTS[0]);
            weighted_strain_energy += (j_norm * w) * (j_norm * w);

            if k == 0 {
                axisym_vol_vel += v * 0.90;
            } else if k == 3 {
                axisym_vol_vel += v * 0.28;
            } else if k == 8 {
                axisym_vol_vel += v * 0.11;
            }

            let mode_gain = MODE_RAD_EFFICIENCY[k];
            rim_shear_force += v * mode_gain * 0.28;

            let rad = v * mode_gain;
            let pan = self.mode_pan[k];
            top_skin_l += rad * (0.5 * (1.0 - pan)).sqrt();
            top_skin_r += rad * (0.5 * (1.0 + pan)).sqrt();
        }

        // Step degenerate orthogonal doublet modes for (1,1), (2,1), (3,1) (indices k = 1, 2, 4)
        // Driven purely by the strike excitation at a detuned eigenfrequency (+0.85%, -0.85%, +1.15%)
        // so they beat organically with the primary modes without injecting feedback energy!
        const DOUBLET_SRC: [usize; 3] = [1, 2, 4];
        const DOUBLET_DETUNE: [f32; 3] = [1.0085, 0.9915, 1.0115];
        for d in 0..3 {
            let k = DOUBLET_SRC[d];
            let mode_hz = (inst_base_hz * self.mode_ratio[k] * DOUBLET_DETUNE[d]).min(nyquist_guard);
            let omega = (TAU * mode_hz * self.inv_sr).min(1.85);
            let eff_damp = self.mode_damp[k];
            let doublet_drive = total_exciter_force * self.spatial_weight[k] * 0.032;
            let mut dv = (self.doublet_v[d] - omega * self.doublet_w[d]) * eff_damp + doublet_drive;
            let mut dw = self.doublet_w[d] * eff_damp + omega * dv;
            dv = flush_denormal(dv);
            dw = flush_denormal(dw);
            self.doublet_v[d] = dv;
            self.doublet_w[d] = dw;

            let rad = dv * MODE_RAD_EFFICIENCY[k] * 0.42;
            let pan = -self.mode_pan[k];
            top_skin_l += rad * (0.5 * (1.0 - pan)).sqrt();
            top_skin_r += rad * (0.5 * (1.0 + pan)).sqrt();
        }

        let e_coeff = if weighted_strain_energy > self.deflection_energy { 0.12 } else { 0.0025 };
        self.deflection_energy = flush_denormal(
            self.deflection_energy + e_coeff * (weighted_strain_energy - self.deflection_energy),
        );

        // 8. Sympathetic Snare Wire / Djembe Birimintingo Sega Ring / Bendir Gut Buzz
        let buzz_amt = params.get(SOMA_BASE + SM_BUZZ_AMOUNT).clamp(0.0, 1.0);
        let mut buzz_sig = 0.0f32;
        if buzz_amt > 0.005 {
            let skin_vel = (self.mode_v[0] + 0.7 * self.mode_v[1] + 0.5 * self.mode_v[2]).abs();
            let target_buzz = (skin_vel * 6.5).min(1.2);
            let b_coeff = if target_buzz > self.buzz_env { 0.22 } else { 0.0035 };
            self.buzz_env = flush_denormal(self.buzz_env + b_coeff * (target_buzz - self.buzz_env));

            let rattle_noise = rng.bipolar() * self.buzz_env;
            let f_buzz = (TAU * 3100.0 * self.inv_sr).min(0.82);
            let hp = rattle_noise - self.buzz_z2 - 0.38 * self.buzz_z1;
            self.buzz_z1 = flush_denormal(self.buzz_z1 + f_buzz * hp);
            self.buzz_z2 = flush_denormal(self.buzz_z2 + f_buzz * self.buzz_z1);
            buzz_sig = (self.buzz_z1 * 0.75 + hp * 0.35) * buzz_amt * 0.55;
        }

        // 9. Domain III: Bidirectional Cylindrical/Conical Air Column Waveguide & Helmholtz Port
        let cavity_type_i = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5);
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.05, 1.0);
        let port_tuning = params.get(SOMA_BASE + SM_PORT_TUNING).clamp(0.0, 1.0);
        let shell_warmth = params.get(SOMA_BASE + SM_SHELL_WARMTH).clamp(0.0, 1.0);

        let delay_samples = ((8.0 + 96.0 * cavity_vol) * (self.sample_rate / 48000.0))
            .clamp(6.0, (AIR_WAVEGUIDE_LEN - 2) as f32) as usize;
        let half_delay = (delay_samples / 2).max(3);
        let bot_idx = (self.air_write_idx + AIR_WAVEGUIDE_LEN - delay_samples) % AIR_WAVEGUIDE_LEN;
        let mid_idx = (self.air_write_idx + AIR_WAVEGUIDE_LEN - half_delay) % AIR_WAVEGUIDE_LEN;

        // Mid-chamber waist reflection (Goblet neck constriction, Hourglass waist, or Tapered Conga belly)
        let waist_refl_coeff = match cavity_type_i {
            0 => 0.18,  // Parabolic kettle curvature
            1 => 0.46,  // Goblet Djembe narrow throat constriction
            2 => -0.22, // Tapered Conga barrel expansion/taper
            3 => 0.52,  // Hourglass Talking Drum narrow waist constriction
            4 => -0.18, // Wide-belly Taiko barrel
            _ => 0.0,
        };

        let down_at_mid = self.air_down[mid_idx];
        let down_at_bot = self.air_down[bot_idx];
        let up_at_top = self.air_up[bot_idx];

        // Helmholtz / Cavity resonance frequency
        let cavity_res_hz = match cavity_type_i {
            0 => (self.base_freq_hz * (0.76 + 0.32 * port_tuning) / (0.65 + 0.55 * cavity_vol)).clamp(42.0, 380.0),
            1 => (58.0 + 64.0 * port_tuning) / (0.62 + 0.58 * cavity_vol), // Djembe / Darbuka deep sub-bass "Doum"
            2 => (72.0 + 78.0 * port_tuning) / (0.65 + 0.55 * cavity_vol), // Conga / Tumba warm open-bottom air column
            3 => self.base_freq_hz * self.pedal_ratio_smooth * (0.88 + 0.24 * port_tuning),
            4 => (38.0 + 46.0 * port_tuning) / (0.70 + 0.55 * cavity_vol), // O-Daiko / Nagado-Daiko sub-bass barrel
            _ => 190.0 + 150.0 * port_tuning,
        };

        let omega_cav = (TAU * cavity_res_hz.min(nyquist_guard) * self.inv_sr).min(1.4);
        // Sample-rate-independent cavity T60 in seconds (with turbulent port vortex shedding at high velocity)
        let cav_t60 = match cavity_type_i {
            0 => 0.55, // Sealed copper kettle internal reflection
            1 => 0.34, // Goblet Helmholtz neck (deep, chest-hitting sub-bass "Doum" plug!)
            2 => 0.30, // Open stave barrel (warm Afro-Cuban conga/tumba air column)
            3 => 0.38, // Hourglass air column (Talking Drum / Dundun waist)
            4 => 0.62, // Deep Taiko barrel (massive O-Daiko sub-bass resonance)
            _ => 0.12, // Open frame hoop
        };
        let base_cav_damp = (-(6.907_755 / cav_t60) * self.inv_sr).exp();
        let vortex_loss = (self.cavity_v.abs() * 0.0025).min(0.004);
        let eff_cav_damp = (base_cav_damp - vortex_loss).max(0.985);

        let air_drive = (axisym_vol_vel * 0.28 + down_at_bot * 0.16 + direct_piston_wave * 0.12) * omega_cav;
        self.cavity_v = flush_denormal((self.cavity_v - omega_cav * self.cavity_w) * eff_cav_damp + air_drive);
        self.cavity_w = flush_denormal(self.cavity_w * eff_cav_damp + omega_cav * self.cavity_v);

        // Sympathetic bottom head for Dual-Head drums (3 = Hourglass Talking Drum/Dundun/Bata, 4 = Taiko)
        let mut bottom_port_radiation = self.cavity_v - self.air_port_lp * 0.35;
        if cavity_type_i == 3 || cavity_type_i == 4 {
            let res_ratio = 0.82 + 0.36 * port_tuning;
            let res_hz = (inst_base_hz * res_ratio).clamp(30.0, nyquist_guard);
            let omega_res = (TAU * res_hz * self.inv_sr).min(1.5);
            let res_t60 = if cavity_type_i == 4 { 0.68 } else { 0.42 };
            let res_damp = (-(6.907_755 / res_t60) * self.inv_sr).exp();
            self.res_head_v = flush_denormal(
                (self.res_head_v - omega_res * self.res_head_w) * res_damp + down_at_bot * omega_res * 0.38,
            );
            self.res_head_w = flush_denormal(self.res_head_w * res_damp + omega_res * self.res_head_v);
            bottom_port_radiation = self.cavity_v * 0.48 + self.res_head_v * 0.52;
        }

        // Open-end low-pass reflection vs closed-end positive reflection
        self.air_port_lp = flush_denormal(self.air_port_lp + 0.18 * (down_at_bot - self.air_port_lp));
        let bottom_refl = match cavity_type_i {
            0 => 0.58 * down_at_bot,                   // Sealed parabolic kettle
            3 | 4 => 0.48 * self.res_head_v,           // Bounces off bottom sympathetic head
            5 => -0.15 * self.air_port_lp,             // Shallow open frame
            _ => -0.56 * self.air_port_lp,             // Open-bottom Goblet / Conga barrel phase-inverting reflection
        };

        let raw_down = axisym_vol_vel * 0.45 + direct_piston_wave * 0.25 + up_at_top * 0.25;
        let raw_up = bottom_refl + down_at_mid * waist_refl_coeff;
        let compress_drive = 1.0 + 1.8 * shell_warmth;
        self.air_down[self.air_write_idx] = flush_denormal(soft_clip(raw_down * compress_drive) / compress_drive);
        self.air_up[self.air_write_idx] = flush_denormal(soft_clip(raw_up * compress_drive) / compress_drive);
        self.air_write_idx = (self.air_write_idx + 1) % AIR_WAVEGUIDE_LEN;

        // 10. Domain IV: Wood / Copper / Clay Shell Wall Structural Modes
        // Driven by BOTH the bearing-edge rim reflection AND the internal cavity air pressure!
        // Note: Real wood/metal shell modes have fast structural damping (8..35 ms) so they sound like
        // hollow wood/copper body formants, NOT continuous ringing tuning forks!
        let shell_mat = (params.get(SOMA_BASE + SM_SHELL_MATERIAL).round() as i32).clamp(0, 4);
        let shell_res = params.get(SOMA_BASE + SM_SHELL_RESONANCE).clamp(0.0, 1.0);
        let (shell_freqs, shell_t60): ([f32; NUM_SHELL_MODES], f32) = match shell_mat {
            // 0 = Hand-Carved Hardwood (Lenke / Iroko — West African Djembe / Bata woody body)
            0 => ([285.0, 640.0, 1380.0, 2650.0], 0.075),
            // 1 = Hammered Copper Kettle (Orchestral Timpani metallic bowl shimmer)
            1 => ([390.0, 980.0, 2240.0, 4200.0], 0.165),
            // 2 = Bent Oak / Ash Staves (Conga / Taiko hollow stave barrel)
            2 => ([225.0, 520.0, 1140.0, 2280.0], 0.082),
            // 3 = Fired Clay / Ceramic Goblet (Darbuka / Udu crisp ceramic body)
            3 => ([350.0, 890.0, 2120.0, 3950.0], 0.115),
            // 4 = Birch / Maple Ply Hoop (Frame drum / studio shell)
            _ => ([205.0, 480.0, 1060.0, 2380.0], 0.065),
        };

        let size_scale = 1.35 - 0.65 * params.get(SOMA_BASE + SM_HEAD_DIAMETER).clamp(0.0, 1.0);
        let shell_drive = (rim_shear_force * 0.55 + direct_piston_wave * 0.45 + self.cavity_v * 0.25) * shell_res;
        let mut shell_rad_l = 0.0f32;
        let mut shell_rad_r = 0.0f32;

        if shell_res > 0.005 {
            for s in 0..NUM_SHELL_MODES {
                let f_s = (shell_freqs[s] * size_scale).min(nyquist_guard);
                let omega_s = (TAU * f_s * self.inv_sr).min(1.75);
                let mode_t60 = (shell_t60 / (1.0 + 0.55 * (s as f32))).max(0.012);
                let mode_d = (-(6.907_755 / mode_t60) * self.inv_sr).exp();
                let mut sv = (self.shell_v[s] - omega_s * self.shell_w[s]) * mode_d + shell_drive * omega_s * 0.12;
                let mut sw = self.shell_w[s] * mode_d + omega_s * sv;
                sv = flush_denormal(sv);
                sw = flush_denormal(sw);
                self.shell_v[s] = sv;
                self.shell_w[s] = sw;

                if s % 2 == 0 {
                    shell_rad_l += sv * 0.65;
                    shell_rad_r += sv * 0.35;
                } else {
                    shell_rad_l += sv * 0.35;
                    shell_rad_r += sv * 0.65;
                }
            }
        }

        // 11. Acoustic Radiation Field: Direct Piston Wave + Rim Wavefront + Top Skin + Bottom Port + Shell
        let mic_persp = params.get(SOMA_BASE + SM_MIC_PERSPECTIVE).clamp(0.0, 1.0);
        let top_gain = 1.15 - 0.38 * mic_persp;
        let port_gain = if cavity_type_i == 0 {
            0.12 * mic_persp * cavity_coupling
        } else {
            (0.45 + 0.95 * mic_persp) * (0.45 + 0.55 * cavity_coupling)
        };
        let shell_gain = (0.45 + 0.65 * mic_persp) * shell_res;

        // Direct impact + rim wave projection gives the immediate physical skin transient before modal build-up
        let direct_transient = direct_piston_wave * 0.65
            + whip_wave * 0.85
            + transient_force * 0.55
            + (near_rim_hit * 0.32 + far_rim_hit * 0.20);
        let strike_pan = ((self.strike_angle - 0.5) * 2.0 * self.strike_pos * 0.55).clamp(-0.75, 0.75);
        let dir_l = direct_transient * (0.5 * (1.0 - strike_pan)).sqrt();
        let dir_r = direct_transient * (0.5 * (1.0 + strike_pan)).sqrt();

        let mut out_l = dir_l * top_gain
            + top_skin_l * top_gain * 0.52
            + bottom_port_radiation * port_gain * 0.55
            + shell_rad_l * shell_gain * 0.65
            + buzz_sig * 0.45;
        let mut out_r = dir_r * top_gain
            + top_skin_r * top_gain * 0.52
            + bottom_port_radiation * port_gain * 0.55
            + shell_rad_r * shell_gain * 0.65
            + buzz_sig * 0.45;

        // Early stage/floor boundary reflections
        let room_early = params.get(SOMA_BASE + SM_ROOM_EARLY).clamp(0.0, 1.0);
        if room_early > 0.005 {
            let tap1_l = self.early_buf_l[(self.early_idx + 64 - 19) % 64];
            let tap2_l = self.early_buf_r[(self.early_idx + 64 - 47) % 64];
            let tap1_r = self.early_buf_r[(self.early_idx + 64 - 23) % 64];
            let tap2_r = self.early_buf_l[(self.early_idx + 64 - 53) % 64];

            self.early_buf_l[self.early_idx] = flush_denormal(out_l * 0.68 + tap2_l * 0.14);
            self.early_buf_r[self.early_idx] = flush_denormal(out_r * 0.68 + tap2_r * 0.14);
            self.early_idx = (self.early_idx + 1) % 64;

            let refl_mix = room_early * 0.32;
            out_l += (tap1_l * 0.65 + tap2_l * 0.35) * refl_mix;
            out_r += (tap1_r * 0.65 + tap2_r * 0.35) * refl_mix;
        }

        if shell_warmth > 0.01 {
            let w_drive = 1.0 + 1.35 * shell_warmth;
            out_l = soft_clip(out_l * w_drive) / w_drive.sqrt();
            out_r = soft_clip(out_r * w_drive) / w_drive.sqrt();
        }

        let dc_l = out_l - self.dc_x1_l + 0.996 * self.dc_y1_l;
        self.dc_x1_l = out_l;
        self.dc_y1_l = flush_denormal(dc_l);

        let dc_r = out_r - self.dc_x1_r + 0.996 * self.dc_y1_r;
        self.dc_x1_r = out_r;
        self.dc_y1_r = flush_denormal(dc_r);

        (dc_l * 1.45, dc_r * 1.45)
    }
}
