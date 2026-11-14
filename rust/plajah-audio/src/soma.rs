// SOMA — Real-Time Multi-Physics Heritage Acoustic Percussion & Chamber Simulator (Instrument 06).
//
// Models six physically coupled acoustic wave phenomena in real time with zero heap allocations:
//   1. Biomechanical Striker / Hand / Mallet Contact & 2D Traveling-Wave Rim Reflections:
//      - Bidirectional Hunt-Crossley nonlinear contact force F_c = k * delta^alpha * (1 + b * d_delta/dt)
//      - Direct piston acceleration wavefront (monopole air compression pulse from the indenting skin)
//      - Multi-point hand/finger whip cascade (palm touchdown -> knuckle/fingertip slap micro-impacts)
//      - 2D circular membrane traveling-wave delay lines to near rim a*(1 - r/a) and far rim a*(1 + r/a).
//   2. 16-Mode 2D Circular Membrane Solver with Exact j_{mn}^2 Kirchhoff Bending Dispersion,
//      C.V. Raman Concentric Syahi/Karanai Harmonic Paste Loading, Full m >= 1 Dorsal-Spine
//      Doublet Splitting, Nonlinear Von Kármán Tension Stretch, and Heritage Collagen Aging:
//      - Exact Bessel series J_m(j_{mn} r/a) nodal excitation + cos(m*dtheta)/sin(m*dtheta) projection
//      - C.V. Raman harmonic eigen-ratios (1 : 2.002 : 2.998 : 4.002 : 5.000) under syahi paste load
//      - Aged hide collagen cross-linking & viscoelastic HF relaxation.
//   3. Coupled Bidirectional Tube Waveguide + Hand-Adze Chisel Allpass Diffusion + Dual-Aperture
//      Udu/Ghatam Helmholtz Hand Occlusion & Sympathetic Bottom Head.
//   4. Hunt-Crossley Unilateral Gut-Snare / Birimintingo Sega-Ring Chatter Mechanics.
//   5. Seasoned Wood / Hammered Copper / Fired Clay Shell Wall Structural Modes & Bearing-Edge Coupling.
//   6. Directional 3-Point Acoustic Radiation (Top Batter Skin + Bottom Port/Resonant Head + Shell Body).

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
pub const NUM_CLOUD_BANDS: usize = 8;
const CLOUD_SPACING: f32 = 1.42;
const CLOUD_K: f32 = 0.62;
const AIR_WAVEGUIDE_LEN: usize = 128;
const RIM_WAVEGUIDE_LEN: usize = 256;
const EARLY_ROOM_LEN: usize = 1024;

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

/// 1: Goblet Helmholtz (Djembe / Darbuka / Doumbek) -- strong bass/fifth alignment & bright slap rim.
const GOBLET_DRUM_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    1.000, 1.495, 1.985, 2.210, 2.540, 2.815, 3.040, 3.380,
    3.490, 3.560, 3.920, 4.040, 4.120, 4.460, 4.510, 4.720,
];
/// 2: Heavy Oak Stave Barrel (Conga / Bongo / Atabaque) -- stiff ash baffle lifts dipole & quadrupole.
const STAVE_BARREL_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    1.000, 1.568, 2.135, 2.310, 2.660, 2.930, 3.165, 3.515,
    3.620, 3.695, 4.085, 4.165, 4.265, 4.620, 4.660, 4.885,
];
/// 3: Hourglass Dual-Head Tension Cord (Tama / Talking Drum / Kalangu) -- dual-skin waist loading.
const HOURGLASS_DRUM_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    0.920, 1.420, 1.880, 2.140, 2.460, 2.710, 2.940, 3.240,
    3.380, 3.450, 3.810, 3.920, 4.010, 4.350, 4.410, 4.620,
];
/// 4: Deep Cedar Barrel (Nagado / Odaiko Taiko) -- massive air mass lowers (0,1) & thickens mid ring.
const TAIKO_BARREL_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    1.000, 1.640, 2.220, 2.410, 2.790, 3.080, 3.320, 3.690,
    3.790, 3.860, 4.240, 4.330, 4.420, 4.790, 4.840, 5.060,
];
/// 5: Shallow Open Frame / Hoop (Bodhran / Tar / Bendir) -- lightly air-loaded plate partials.
const FRAME_HOOP_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    1.000, 1.592, 2.160, 2.295, 2.680, 2.940, 3.190, 3.520,
    3.610, 3.670, 4.060, 4.140, 4.220, 4.590, 4.640, 4.860,
];

/// C.V. Raman (1920) & Rossing-Sykes (1982) concentric iron-paste (*Syahi* / *Karanai*) loaded
/// eigen-ratios relative to (1,1) singing pitch (Banaras Tabla Dayan / Tanjore Mridangam / Pakhawaj).
/// Aligns degenerate clusters {(2,1),(0,2)} -> 2f_1, {(3,1),(1,2)} -> 3f_1, {(4,1),(2,2),(0,3)} -> 4f_1,
/// {(5,1),(3,2)} -> 5f_1 with micro-beating offsets from hand-applied paste eccentricity.
const SYAHI_HARMONIC_RATIOS: [f32; NUM_MEMBRANE_MODES] = [
    0.542, // (0,1) heavy syahi-loaded sub-fundamental (damped by kinar/sur touch, full on Tun/Ge)
    1.000, // (1,1) principal singing pitch (Sa / Pancham)
    2.002, // (2,1) 2nd harmonic outer ring
    1.997, // (0,2) 2nd harmonic inner syahi ring (beats slowly against (2,1)!)
    2.998, // (3,1) 3rd harmonic sextupole
    3.004, // (1,2) 3rd harmonic inner dipole
    4.002, // (4,1) 4th harmonic
    3.995, // (2,2) 4th harmonic inner quadrupole
    4.011, // (0,3) 4th harmonic axisymmetric core
    5.000, // (5,1) 5th harmonic
    5.008, // (3,2) 5th harmonic inner sextupole
    6.004, // (6,1) 6th harmonic
    5.991, // (1,3) 6th harmonic inner dipole
    6.995, // (4,2) 7th harmonic
    7.008, // (7,1) 7th harmonic
    7.985, // (2,3) 8th harmonic
];

/// Natural dorsal-spine hide anisotropy detune ratios for orthogonal sin(m*theta) doublets (m >= 1).
const BASE_DOUBLET_SPLIT: [f32; NUM_MEMBRANE_MODES] = [
    0.0,     // 0: (0,1) m=0 (axisymmetric — no doublet)
    0.0068,  // 1: (1,1) principal dipole spine/flank split
    -0.0062, // 2: (2,1) quadrupole split
    0.0,     // 3: (0,2) m=0
    0.0082,  // 4: (3,1) sextupole split
    -0.0055, // 5: (1,2)
    0.0074,  // 6: (4,1)
    -0.0064, // 7: (2,2)
    0.0,     // 8: (0,3) m=0
    0.0088,  // 9: (5,1)
    -0.0071, // 10: (3,2)
    0.0079,  // 11: (6,1)
    -0.0058, // 12: (1,3)
    0.0069,  // 13: (4,2)
    -0.0084, // 14: (7,1)
    0.0066,  // 15: (2,3)
];

/// Relative acoustic radiation efficiency per mode.
const MODE_RAD_EFFICIENCY: [f32; NUM_MEMBRANE_MODES] = [
    1.00, // (0,1)
    0.72, // (1,1)
    0.42, // (2,1)
    0.68, // (0,2)
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

    whip_delay_samples: u32,
    whip_env: f32,
    whip_freq_hz: f32,
    whip_bp_z1: f32,
    whip_bp_z2: f32,

    brush_env: f32,
    slap_pop_env: f32,
    slap_bp_z1: f32,
    slap_bp_z2: f32,
    muted_touch_damp: f32,

    rim_wave_buf: [f32; RIM_WAVEGUIDE_LEN],
    rim_write_idx: usize,
    near_rim_delay: usize,
    far_rim_delay: usize,
    rim_lp_state: f32,

    // ── Domain II: 16-Mode 2D Bessel Circular Membrane + Full m>=1 Dorsal-Spine Doublets ──
    base_freq_hz: f32,
    strike_pos: f32,
    strike_angle: f32,
    spatial_weight: [f32; NUM_MEMBRANE_MODES],
    doublet_weight: [f32; NUM_MEMBRANE_MODES],
    mode_pan: [f32; NUM_MEMBRANE_MODES],
    mode_ratio: [f32; NUM_MEMBRANE_MODES],
    doublet_detune: [f32; NUM_MEMBRANE_MODES],
    mode_damp: [f32; NUM_MEMBRANE_MODES],
    mode_rad_loss: [f32; NUM_MEMBRANE_MODES],
    mode_w: [f32; NUM_MEMBRANE_MODES],
    mode_v: [f32; NUM_MEMBRANE_MODES],
    doublet_w: [f32; NUM_MEMBRANE_MODES],
    doublet_v: [f32; NUM_MEMBRANE_MODES],

    cloud_ic1: [f32; NUM_CLOUD_BANDS],
    cloud_ic2: [f32; NUM_CLOUD_BANDS],
    cloud_coeffs: [[f32; 3]; NUM_CLOUD_BANDS],
    cloud_env: [f32; NUM_CLOUD_BANDS],
    cloud_damp: [f32; NUM_CLOUD_BANDS],
    cloud_ratio: [f32; NUM_CLOUD_BANDS],
    cloud_tilt: [f32; NUM_CLOUD_BANDS],

    impact_tension_env: f32,
    impact_tension_decay: f32,
    radiation_burst_env: f32,
    deflection_energy: f32,
    pedal_ratio_smooth: f32,
    aperture_smooth: f32,

    cached_air_load: f32,
    cached_decay: f32,
    cached_damp_hf: f32,
    cached_cavity_type: f32,
    cached_cavity_vol: f32,
    cached_skin_mat: f32,
    cached_heritage_age: f32,
    cached_craft_asym: f32,
    cached_syahi_load: f32,

    /// Hunt-Crossley unilateral gut-snare / birimintingo ring state
    buzz_env: f32,
    buzz_z1: f32,
    buzz_z2: f32,
    snare_z: f32,
    snare_v: f32,

    // ── Domain III: Bidirectional Tube Waveguide + Chisel Diffusion + Helmholtz Port ──
    air_down: [f32; AIR_WAVEGUIDE_LEN],
    air_up: [f32; AIR_WAVEGUIDE_LEN],
    air_write_idx: usize,
    air_port_lp: f32,
    chisel_ap_z1: f32,
    chisel_ap_z2: f32,
    cavity_w: f32,
    cavity_v: f32,
    res_head_w: f32,
    res_head_v: f32,

    // ── Domain IV: Wood / Copper / Clay Shell Wall Structural Modes & Radiation ──
    shell_w: [f32; NUM_SHELL_MODES],
    shell_v: [f32; NUM_SHELL_MODES],
    early_buf_l: [f32; EARLY_ROOM_LEN],
    early_buf_r: [f32; EARLY_ROOM_LEN],
    early_idx: usize,
    dc_x1_l: f32,
    dc_y1_l: f32,
    dc_x1_r: f32,
    dc_y1_r: f32,

    // ── Deep skin (GPU) ──
    pub deep_in: [f32; 2],
    pub last_exciter_force: f32,
    pub last_cloud: f32,
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
            doublet_weight: [0.0; NUM_MEMBRANE_MODES],
            mode_pan: [0.0; NUM_MEMBRANE_MODES],
            mode_ratio: [1.0; NUM_MEMBRANE_MODES],
            doublet_detune: [1.0; NUM_MEMBRANE_MODES],
            mode_damp: [0.995; NUM_MEMBRANE_MODES],
            mode_rad_loss: [0.002; NUM_MEMBRANE_MODES],
            mode_w: [0.0; NUM_MEMBRANE_MODES],
            mode_v: [0.0; NUM_MEMBRANE_MODES],
            doublet_w: [0.0; NUM_MEMBRANE_MODES],
            doublet_v: [0.0; NUM_MEMBRANE_MODES],
            cloud_ic1: [0.0; NUM_CLOUD_BANDS],
            cloud_ic2: [0.0; NUM_CLOUD_BANDS],
            cloud_coeffs: [[0.0; 3]; NUM_CLOUD_BANDS],
            cloud_env: [0.0; NUM_CLOUD_BANDS],
            cloud_damp: [0.0; NUM_CLOUD_BANDS],
            cloud_ratio: [8.0; NUM_CLOUD_BANDS],
            cloud_tilt: [0.0; NUM_CLOUD_BANDS],
            impact_tension_env: 0.0,
            impact_tension_decay: 0.999,
            radiation_burst_env: 0.0,
            deflection_energy: 0.0,
            pedal_ratio_smooth: 1.0,
            aperture_smooth: 0.0,
            cached_air_load: -1.0,
            cached_decay: -1.0,
            cached_damp_hf: -1.0,
            cached_cavity_type: -1.0,
            cached_cavity_vol: -1.0,
            cached_skin_mat: -1.0,
            cached_heritage_age: -1.0,
            cached_craft_asym: -1.0,
            cached_syahi_load: -1.0,
            buzz_env: 0.0,
            buzz_z1: 0.0,
            buzz_z2: 0.0,
            snare_z: 0.001,
            snare_v: 0.0,
            air_down: [0.0; AIR_WAVEGUIDE_LEN],
            air_up: [0.0; AIR_WAVEGUIDE_LEN],
            air_write_idx: 0,
            air_port_lp: 0.0,
            chisel_ap_z1: 0.0,
            chisel_ap_z2: 0.0,
            cavity_w: 0.0,
            cavity_v: 0.0,
            res_head_w: 0.0,
            res_head_v: 0.0,
            shell_w: [0.0; NUM_SHELL_MODES],
            shell_v: [0.0; NUM_SHELL_MODES],
            early_buf_l: [0.0; EARLY_ROOM_LEN],
            early_buf_r: [0.0; EARLY_ROOM_LEN],
            early_idx: 0,
            dc_x1_l: 0.0,
            dc_y1_l: 0.0,
            dc_x1_r: 0.0,
            dc_y1_r: 0.0,
            deep_in: [0.0; 2],
            last_exciter_force: 0.0,
            last_cloud: 0.0,
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
        self.doublet_w = [0.0; NUM_MEMBRANE_MODES];
        self.doublet_v = [0.0; NUM_MEMBRANE_MODES];
        self.cloud_ic1 = [0.0; NUM_CLOUD_BANDS];
        self.cloud_ic2 = [0.0; NUM_CLOUD_BANDS];
        self.cloud_env = [0.0; NUM_CLOUD_BANDS];
        self.impact_tension_env = 0.0;
        self.radiation_burst_env = 0.0;
        self.deflection_energy = 0.0;
        self.buzz_env = 0.0;
        self.snare_z = 0.001;
        self.snare_v = 0.0;
        self.air_down = [0.0; AIR_WAVEGUIDE_LEN];
        self.air_up = [0.0; AIR_WAVEGUIDE_LEN];
        self.air_port_lp = 0.0;
        self.chisel_ap_z1 = 0.0;
        self.chisel_ap_z2 = 0.0;
        self.cavity_w = 0.0;
        self.cavity_v = 0.0;
        self.res_head_w = 0.0;
        self.res_head_v = 0.0;
        self.shell_w = [0.0; NUM_SHELL_MODES];
        self.shell_v = [0.0; NUM_SHELL_MODES];
        self.early_buf_l = [0.0; EARLY_ROOM_LEN];
        self.early_buf_r = [0.0; EARLY_ROOM_LEN];
        self.early_idx = 0;
        self.deep_in = [0.0; 2];
    }

    pub fn gate_cloud_below(&mut self, top_ratio: f32) {
        for b in 0..NUM_CLOUD_BANDS {
            if self.cloud_ratio[b] < top_ratio {
                self.cloud_tilt[b] = 0.0;
            }
        }
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
            e += self.mode_w[k] * self.mode_w[k]
                + self.mode_v[k] * self.mode_v[k]
                + self.doublet_w[k] * self.doublet_w[k]
                + self.doublet_v[k] * self.doublet_v[k];
        }
        for b in 0..NUM_CLOUD_BANDS {
            e += self.cloud_env[b] * self.cloud_env[b];
        }
        e < 1e-9
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, params: &Params, rng: &mut Rng) {
        for k in 0..NUM_MEMBRANE_MODES {
            self.mode_w[k] *= 0.18;
            self.mode_v[k] *= 0.18;
            self.doublet_w[k] *= 0.18;
            self.doublet_v[k] *= 0.18;
        }

        let vel = velocity.clamp(0.02, 1.0);
        let keytrack = params.get(SOMA_BASE + SM_KEYTRACK).clamp(0.0, 1.0);
        let diameter_norm = params.get(SOMA_BASE + SM_HEAD_DIAMETER).clamp(0.0, 1.0);
        let craft_asym = params.get(SOMA_BASE + SM_CRAFT_ASYMMETRY).clamp(0.0, 1.0);
        let syahi_load = params.get(SOMA_BASE + SM_SYAHI_LOAD).clamp(0.0, 1.0);

        // Physical head diameter in meters: 0.15 m (6" bongo/dayan) .. 0.91 m (36" concert/timpani)
        let radius_m = 0.075 + 0.38 * diameter_norm;
        let natural_hz = 260.0 * (0.20f32).powf(diameter_norm);
        self.base_freq_hz = (natural_hz * (note_hz / natural_hz).powf(keytrack)).clamp(24.0, 1200.0);

        let striker_type = (params.get(SOMA_BASE + SM_STRIKER_TYPE).round() as i32).clamp(0, 5) as u8;
        self.striker_type = striker_type;

        let hardness_param = params.get(SOMA_BASE + SM_STRIKER_HARDNESS).clamp(0.0, 1.0);
        let vel_hardness = params.get(SOMA_BASE + SM_VEL_HARDNESS).clamp(0.0, 1.0);
        let eff_hardness = (hardness_param + vel_hardness * (vel - 0.30) * 0.70).clamp(0.03, 1.0);

        let mass_param = params.get(SOMA_BASE + SM_STRIKER_MASS).clamp(0.0, 1.0);
        let pos_param = params.get(SOMA_BASE + SM_STRIKE_POS).clamp(0.0, 0.95);
        // Micro-humanization of hand strike radius & azimuth
        let jitter = rng.bipolar() * (0.005 + 0.008 * craft_asym) * pos_param;
        let rho = (pos_param + jitter).clamp(0.0, 0.95);
        self.strike_pos = rho;
        let angle_jitter = rng.bipolar() * 0.015 * (0.3 + craft_asym);
        self.strike_angle = (params.get(SOMA_BASE + SM_STRIKE_ANGLE) + angle_jitter).clamp(0.0, 1.0);

        // Bearing-edge out-of-roundness from hand-carved wooden rim (`craft_asym`)
        let rim_eccentricity = 1.0 + 0.035 * craft_asym * ((self.strike_angle * TAU).cos());
        let wave_speed_mps = (TAU * radius_m * self.base_freq_hz / BESSEL_ROOTS[0]).clamp(35.0, 320.0);
        let near_dist_m = radius_m * rim_eccentricity * (1.0 - rho).max(0.04);
        let far_dist_m = radius_m * (2.0 - rim_eccentricity) * (1.0 + rho);
        self.near_rim_delay = ((near_dist_m / wave_speed_mps) * self.sample_rate)
            .clamp(3.0, (RIM_WAVEGUIDE_LEN - 4) as f32) as usize;
        self.far_rim_delay = ((far_dist_m / wave_speed_mps) * self.sample_rate)
            .clamp(8.0, (RIM_WAVEGUIDE_LEN - 2) as f32) as usize;

        let (footprint_radius, exp_alpha, base_mass, stiff_scale, touch_damp) = match striker_type {
            0 => (0.105 - 0.055 * eff_hardness, 2.25, 0.72 + 0.95 * mass_param, 2.6, 0.0),
            1 => (0.095 - 0.040 * eff_hardness, 2.15, 0.65 + 0.85 * mass_param, 3.2, 0.0),
            2 => (0.032 - 0.015 * eff_hardness, 2.75, 0.24 + 0.30 * mass_param, 8.5, 0.0),
            3 => (0.135, 2.10, 0.85 + 1.10 * mass_param, 3.4, 0.00085 + 0.0012 * mass_param),
            4 => (0.028 - 0.012 * eff_hardness, 2.65, 0.30 + 0.42 * mass_param, 9.2, 0.0),
            _ => (0.022 - 0.010 * eff_hardness, 2.55, 0.20 + 0.30 * mass_param, 7.8, 0.0),
        };

        self.striker_active = true;
        self.striker_z = 0.0;
        self.striker_v = (0.95 + 2.35 * vel.powf(0.80)) * (1.25 - 0.32 * mass_param);
        self.striker_mass = base_mass;
        self.striker_exponent = exp_alpha;
        self.striker_stiffness = stiff_scale * (1.8 * (10.0f32).powf(eff_hardness));
        self.striker_hysteresis = 0.22 + 0.28 * (1.0 - eff_hardness);
        self.muted_touch_damp = touch_damp;
        self.prev_contact_force = 0.0;

        let brush_amt = params.get(SOMA_BASE + SM_HAND_BRUSH).clamp(0.0, 1.0);
        match striker_type {
            2 => {
                self.whip_delay_samples = (0.0013 * self.sample_rate) as u32;
                self.whip_env = vel * (0.95 + 0.45 * eff_hardness);
                self.whip_freq_hz = 1650.0 + 1150.0 * eff_hardness;
            }
            1 | 3 => {
                self.whip_delay_samples = (0.0018 * self.sample_rate) as u32;
                self.whip_env = vel * (0.42 + 0.35 * brush_amt);
                self.whip_freq_hz = 1050.0 + 750.0 * eff_hardness;
            }
            4 | 5 => {
                self.whip_delay_samples = (0.0006 * self.sample_rate) as u32;
                self.whip_env = vel * (0.55 + 0.35 * eff_hardness);
                self.whip_freq_hz = 2100.0 + 1100.0 * eff_hardness;
            }
            _ => {
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

        let nonlin_amt = params.get(SOMA_BASE + SM_TENSION_NONLIN).clamp(0.0, 1.0);
        let center_focus = 1.0 - 0.45 * rho;
        // Heavy syahi paste stabilizes pitch against excessive wild downward pitch-drop
        let syahi_pitch_stabilizer = 1.0 - 0.55 * syahi_load;
        self.impact_tension_env = vel.powf(1.1) * (0.18 + 0.62 * nonlin_amt) * center_focus * syahi_pitch_stabilizer;
        let tension_glide_tau = 0.026 + 0.038 * diameter_norm;
        self.impact_tension_decay = (-self.inv_sr / tension_glide_tau).exp();
        self.radiation_burst_env = 1.0;

        // Dorsal spine orientation at theta_spine = 0.18 rad; project strike onto cos(m*dtheta) & sin(m*dtheta)
        let azimuth_rad = (self.strike_angle - 0.5) * core::f32::consts::PI;
        let spine_delta = azimuth_rad - 0.18;
        for k in 0..NUM_MEMBRANE_MODES {
            let m = MODE_M[k];
            let j_mn = BESSEL_ROOTS[k];
            let bessel_val = bessel_j(m, j_mn * rho);
            let footprint_atten = (-0.42 * (j_mn * footprint_radius).powi(2)).exp();

            let mut articulation_tilt = match striker_type {
                2 => {
                    if k == 0 { 0.12 } else if k == 1 { 0.38 } else if m >= 2 { 1.75 } else { 0.85 }
                }
                3 => {
                    if k == 0 { 0.35 } else if k <= 2 { 0.55 } else { 0.90 }
                }
                5 => {
                    if k == 0 { 0.22 } else if m >= 1 { 1.35 } else { 0.75 }
                }
                _ => 1.0,
            };

            // On a Syahi-loaded Tabla/Mridangam, rim/maidan finger strikes ring the harmonic (1,1)..(4,1) series
            if syahi_load > 0.05 && rho > 0.45 {
                if k == 0 {
                    articulation_tilt *= 1.0 - 0.72 * syahi_load;
                } else if k <= 7 {
                    articulation_tilt *= 1.0 + 0.38 * syahi_load;
                }
            }

            let radial_w = bessel_val * footprint_atten * articulation_tilt;
            if m == 0 {
                self.spatial_weight[k] = radial_w;
                self.doublet_weight[k] = 0.0;
            } else {
                let m_theta = (m as f32) * spine_delta;
                // Keep strong primary coupling while routing orthogonal projection into the doublet resonator
                let cos_proj = m_theta.cos();
                let sin_proj = m_theta.sin();
                let asym_mix = 0.32 + 0.68 * craft_asym;
                self.spatial_weight[k] = radial_w * ((1.0 - 0.35 * asym_mix) + 0.35 * asym_mix * cos_proj.abs().max(0.45));
                self.doublet_weight[k] = radial_w * sin_proj * (0.42 + 0.58 * craft_asym);
            }

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
        self.aperture_smooth = params.get(SOMA_BASE + SM_APERTURE_HAND).clamp(0.0, 1.0);

        self.recompute_modal_structure(params);

        let contact_fc = match striker_type {
            0 => 350.0 + 2600.0 * eff_hardness * eff_hardness,
            1 | 3 => 900.0 + 3400.0 * eff_hardness,
            2 => 2200.0 + 5200.0 * eff_hardness,
            _ => 2600.0 + 6500.0 * eff_hardness,
        };
        let pos_gain = (0.35 + 1.1 * rho) * (1.0 - 0.35 * syahi_load);
        let base = self.base_freq_hz * self.pedal_ratio_smooth;
        let top = self.sample_rate * 0.42;
        for b in 0..NUM_CLOUD_BANDS {
            let f = base * self.cloud_ratio[b];
            if f >= top {
                self.cloud_tilt[b] = 0.0;
                self.cloud_coeffs[b] = [0.0; 3];
                continue;
            }
            let x = f / contact_fc;
            self.cloud_tilt[b] = pos_gain / (1.0 + x * x);
            let g = (core::f32::consts::PI * f * self.inv_sr).tan();
            let a1 = 1.0 / (1.0 + g * (g + CLOUD_K));
            let a2 = g * a1;
            self.cloud_coeffs[b] = [a1, a2, g * a2];
        }
    }

    /// Updates modal frequency ratios (with exact j_{mn}^2 bending stiffness + Raman Syahi paste +
    /// dorsal-spine doublet splitting) and heritage collagen-aged two-stage physical damping.
    #[inline]
    fn recompute_modal_structure(&mut self, params: &Params) {
        let air_load = params.get(SOMA_BASE + SM_AIR_LOAD).clamp(0.0, 1.0);
        let cavity_type = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5);
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.0, 1.0);
        let skin_mat = (params.get(SOMA_BASE + SM_SKIN_MATERIAL).round() as i32).clamp(0, 5);
        let decay_norm = params.get(SOMA_BASE + SM_MEMBRANE_DECAY).clamp(0.0, 1.0);
        let damp_hf = params.get(SOMA_BASE + SM_MEMBRANE_DAMP_HF).clamp(0.0, 1.0);
        let heritage_age = params.get(SOMA_BASE + SM_HERITAGE_AGE).clamp(0.0, 1.0);
        let craft_asym = params.get(SOMA_BASE + SM_CRAFT_ASYMMETRY).clamp(0.0, 1.0);
        let syahi_load = params.get(SOMA_BASE + SM_SYAHI_LOAD).clamp(0.0, 1.0);

        self.cached_air_load = air_load;
        self.cached_decay = decay_norm;
        self.cached_damp_hf = damp_hf;
        self.cached_cavity_type = cavity_type as f32;
        self.cached_cavity_vol = cavity_vol;
        self.cached_skin_mat = skin_mat as f32;
        self.cached_heritage_age = heritage_age;
        self.cached_craft_asym = craft_asym;
        self.cached_syahi_load = syahi_load;

        let (base_stiff_disp, base_visc_f2, base_t60_scale) = match skin_mat {
            0 => (0.0014, 0.75, 1.15), // Calfskin / Vellum
            1 => (0.0024, 1.35, 0.78), // Thick Goat Skin (Djembe / Bata)
            2 => (0.0010, 0.80, 0.90), // Thin Goat Skin (Talking Drum / Tabla / Darbuka)
            3 => (0.0036, 1.65, 0.72), // Thick Rawhide / Mule (Conga / Bongo)
            4 => (0.0045, 1.40, 1.05), // Heavy Cowhide (Taiko)
            _ => (0.0008, 0.65, 0.95), // Mylar / Synthetic
        };

        // Aged natural hide collagen cross-linking: seasoned fibers stiffen slightly (+16%),
        // fundamental rings more openly (+12%), while micro-creased upper fibers roll off harsh glare (+28% HF loss).
        let is_natural_hide = skin_mat <= 4;
        let age_eff = if is_natural_hide { heritage_age } else { heritage_age * 0.2 };
        let mat_stiff_disp = base_stiff_disp * (1.0 + 0.16 * age_eff);
        let mat_visc_f2 = base_visc_f2 * (1.0 + 0.28 * age_eff);
        let mat_t60_scale = base_t60_scale * (1.0 + 0.12 * age_eff);

        let chamber_t60_scale = match cavity_type {
            0 => 1.25,
            1 => 0.68,
            2 => 0.62,
            3 => 0.78,
            4 => 1.10,
            _ => 0.72,
        };

        let base_t60 = (0.08 + 1.85 * decay_norm.powf(1.8)) * mat_t60_scale * chamber_t60_scale;
        let hf_law = (0.55 + 1.6 * damp_hf) * mat_visc_f2;
        let visc = |ratio: f32, radial_n: u8| -> f32 {
            let excess = (ratio - 1.55).max(0.0);
            1.0 + hf_law * (0.55 * excess.powf(1.25) + 0.9 * (radial_n.saturating_sub(1) as f32))
        };
        let slap_clamp_upper = match self.striker_type { 2 => 1.8, 3 => 5.2, _ => 1.0 };

        // Exact Kirchhoff-Love bending dispersion scales with radial wavenumber j_{mn}^2 (normalized to j_{11})
        let use_principal_ref = cavity_type == 0 || syahi_load > 0.45;
        let ref_k = if use_principal_ref { 1usize } else { 0usize };
        let j11_inv = 1.0 / BESSEL_ROOTS[1];
        let j_ref_norm = BESSEL_ROOTS[ref_k] * j11_inv;
        let ref_stiff = (1.0 + mat_stiff_disp * j_ref_norm * j_ref_norm).sqrt();

        for k in 0..NUM_MEMBRANE_MODES {
            let vac_ratio = BESSEL_ROOTS[k] / BESSEL_ROOTS[0];
            let drum_loaded = match cavity_type {
                0 => {
                    let mut r = TIMPANI_LOADED_RATIOS[k];
                    if k == 0 {
                        r *= 1.0 + 0.22 * (0.65 - cavity_vol);
                    }
                    r
                }
                1 => GOBLET_DRUM_RATIOS[k],
                2 => STAVE_BARREL_RATIOS[k],
                3 => HOURGLASS_DRUM_RATIOS[k],
                4 => TAIKO_BARREL_RATIOS[k],
                _ => FRAME_HOOP_RATIOS[k],
            };

            let vac_ref = if cavity_type == 0 {
                BESSEL_ROOTS[k] / BESSEL_ROOTS[1]
            } else {
                vac_ratio
            };
            let uncoated_r = vac_ref + (drum_loaded - vac_ref) * air_load;
            // Blend continuously into C.V. Raman's Syahi/Karanai harmonic mode lattice
            let base_r = uncoated_r + (SYAHI_HARMONIC_RATIOS[k] - uncoated_r) * syahi_load;

            let j_k_norm = BESSEL_ROOTS[k] * j11_inv;
            let stiff_factor = ((1.0 + mat_stiff_disp * j_k_norm * j_k_norm).sqrt() / ref_stiff)
                .powf(1.0 - 0.65 * syahi_load);
            let ratio = base_r * stiff_factor;
            self.mode_ratio[k] = ratio;

            // Dorsal-spine + hand-laced tension doublet detuning for all m >= 1 modes
            let split = BASE_DOUBLET_SPLIT[k] * (1.0 + 1.85 * craft_asym) * (1.0 - 0.35 * syahi_load);
            self.doublet_detune[k] = 1.0 + split;

            let mut visc_factor = visc(ratio, MODE_N[k]);
            // Concentric syahi mass increases inertia Q of the singing harmonic modes (1,1)..(4,1)
            if syahi_load > 0.05 {
                if (1..=8).contains(&k) {
                    visc_factor /= 1.0 + 1.35 * syahi_load;
                } else if k == 0 {
                    visc_factor *= 1.0 + 0.55 * syahi_load;
                }
            }

            let kettle_monopole_baffle = if cavity_type == 0 && k == 0 { 2.6 } else { 1.0 };
            let slap_palm_clamp = if self.striker_type == 2 {
                if k == 0 { 5.0 } else if k == 1 { 3.5 } else { 1.8 }
            } else if self.striker_type == 3 {
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

            let rad_eff = MODE_RAD_EFFICIENCY[k];
            let rad_rate = (3.0 + 5.5 * air_load) * rad_eff * (1.0 - 0.35 * syahi_load);
            self.mode_rad_loss[k] = (rad_rate * self.inv_sr).min(0.0006);
        }

        let mut top_ratio = 1.0f32;
        for k in 0..NUM_MEMBRANE_MODES {
            top_ratio = top_ratio.max(self.mode_ratio[k]);
        }
        let cloud_step = CLOUD_SPACING
            + match cavity_type {
                1 | 5 => 0.05,
                2 => 0.02,
                4 => -0.06,
                _ => 0.0,
            }
            + if skin_mat == 5 { 0.04 } else if skin_mat == 4 { -0.04 } else { 0.0 };
        for b in 0..NUM_CLOUD_BANDS {
            let r = top_ratio * 1.08 * cloud_step.powi(b as i32);
            self.cloud_ratio[b] = r;
            let f_band = (self.base_freq_hz * r).max(100.0);
            let air_cap = 0.09 * (1000.0 / f_band).sqrt();
            let t60 = (base_t60 / ((1.0 + 0.5 * (visc(r, 1) - 1.0)) * slap_clamp_upper))
                .min(air_cap)
                .max(0.004);
            self.cloud_damp[b] = (-(6.907_755 / t60) * self.inv_sr).exp();
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
        let pedal_norm = params.get(SOMA_BASE + SM_TENSION_PEDAL).clamp(0.0, 1.0);
        let pedal_semis = (pedal_norm - 0.5) * 24.0 + mod_wheel * 7.0;
        let target_pedal_ratio = (2.0f32).powf(pedal_semis / 12.0) * pitch_bend_ratio;
        self.pedal_ratio_smooth += (target_pedal_ratio - self.pedal_ratio_smooth) * 0.008;

        let target_aperture = params.get(SOMA_BASE + SM_APERTURE_HAND).clamp(0.0, 1.0);
        self.aperture_smooth += (target_aperture - self.aperture_smooth) * 0.006;

        let decay_norm = params.get(SOMA_BASE + SM_MEMBRANE_DECAY).clamp(0.0, 1.0);
        let damp_hf = params.get(SOMA_BASE + SM_MEMBRANE_DAMP_HF).clamp(0.0, 1.0);
        let air_load = params.get(SOMA_BASE + SM_AIR_LOAD).clamp(0.0, 1.0);
        let cavity_type = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5) as f32;
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.0, 1.0);
        let skin_mat = (params.get(SOMA_BASE + SM_SKIN_MATERIAL).round() as i32).clamp(0, 5) as f32;
        let heritage_age = params.get(SOMA_BASE + SM_HERITAGE_AGE).clamp(0.0, 1.0);
        let craft_asym = params.get(SOMA_BASE + SM_CRAFT_ASYMMETRY).clamp(0.0, 1.0);
        let syahi_load = params.get(SOMA_BASE + SM_SYAHI_LOAD).clamp(0.0, 1.0);

        if (decay_norm - self.cached_decay).abs() > 1e-4
            || (damp_hf - self.cached_damp_hf).abs() > 1e-4
            || (air_load - self.cached_air_load).abs() > 1e-4
            || (cavity_type - self.cached_cavity_type).abs() > 1e-4
            || (cavity_vol - self.cached_cavity_vol).abs() > 1e-4
            || (skin_mat - self.cached_skin_mat).abs() > 1e-4
            || (heritage_age - self.cached_heritage_age).abs() > 1e-4
            || (craft_asym - self.cached_craft_asym).abs() > 1e-4
            || (syahi_load - self.cached_syahi_load).abs() > 1e-4
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

        let force_deriv = contact_force - self.prev_contact_force;
        self.prev_contact_force = contact_force;
        let direct_piston_wave = (force_deriv * 0.24 + contact_force * 0.028).clamp(-0.95, 0.95);

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
            self.whip_env = flush_denormal(self.whip_env * (-1.0 / (0.0018 * self.sample_rate)).exp());
        }

        let mut transient_force = 0.0f32;
        if self.slap_pop_env > 1e-5 || self.brush_env > 1e-5 {
            let white = rng.bipolar();
            let base_slap_fc = match self.striker_type {
                2 => 2350.0,
                4 | 5 => 1950.0,
                _ => 980.0,
            };
            let pitch_bias = (180.0 / self.base_freq_hz.max(40.0)).sqrt().clamp(0.72, 1.32);
            let chamber_slap = match self.cached_cavity_type as i32 {
                1 | 5 => 1.18,
                4 => 0.72,
                0 => 0.80,
                _ => 1.00,
            };
            let hide_slap = if self.cached_skin_mat >= 4.5 { 1.16 } else if self.cached_skin_mat >= 3.5 { 0.78 } else { 1.0 };
            let slap_fc = (base_slap_fc * chamber_slap * hide_slap / pitch_bias).clamp(480.0, 5200.0);
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
        let near_idx = (self.rim_write_idx + RIM_WAVEGUIDE_LEN - self.near_rim_delay) % RIM_WAVEGUIDE_LEN;
        let far_idx = (self.rim_write_idx + RIM_WAVEGUIDE_LEN - self.far_rim_delay) % RIM_WAVEGUIDE_LEN;
        let near_rim_hit = self.rim_wave_buf[near_idx];
        let far_rim_hit = self.rim_wave_buf[far_idx];
        let rim_refl = -0.46 * near_rim_hit - 0.28 * far_rim_hit;
        // Aged rawhide/wood bearing edges round off slightly, warming harsh rim-reflection clicks
        let rim_lp_coeff = 0.42 - 0.12 * heritage_age;
        self.rim_lp_state = flush_denormal(self.rim_lp_state + rim_lp_coeff * (rim_refl - self.rim_lp_state));

        let outgoing_wavefront = direct_piston_wave * 0.55 + transient_force * 0.45 + self.rim_lp_state * 0.22;
        self.rim_wave_buf[self.rim_write_idx] = flush_denormal(outgoing_wavefront);
        self.rim_write_idx = (self.rim_write_idx + 1) % RIM_WAVEGUIDE_LEN;

        let total_exciter_force = contact_force * 0.095 + transient_force * 0.45 + self.rim_lp_state * 0.18;
        self.last_exciter_force = total_exciter_force;

        // 5. Physical Nonlinear Tension Pitch Glide
        let nonlin_amt = params.get(SOMA_BASE + SM_TENSION_NONLIN).clamp(0.0, 1.0);
        self.impact_tension_env = flush_denormal(self.impact_tension_env * self.impact_tension_decay);
        self.radiation_burst_env = flush_denormal(self.radiation_burst_env * (-self.inv_sr / 0.038).exp());

        let strain_stretch = (self.deflection_energy * 6.5).tanh() * 0.18 * nonlin_amt * (1.0 - 0.45 * syahi_load);
        let tension_stretch = 1.0 + self.impact_tension_env * 0.42 + strain_stretch;

        // 6. Coupled Cavity Adiabatic Air-Spring Stiffness
        let cavity_coupling = params.get(SOMA_BASE + SM_CAVITY_COUPLING).clamp(0.0, 1.0);
        let adiabatic_stiff = (1.0 + self.cavity_w * cavity_coupling * 0.035).clamp(0.88, 1.14);

        // 7. Domain II: Step all 16 2D Bessel Circular Membrane Eigenmodes + Full m >= 1 Dorsal-Spine Doublets
        let inst_base_hz = self.base_freq_hz * self.pedal_ratio_smooth * tension_stretch;
        let nyquist_guard = self.sample_rate * 0.44;

        let mut top_skin_l = 0.0f32;
        let mut top_skin_r = 0.0f32;
        let mut axisym_vol_vel = 0.0f32;
        let mut rim_shear_force = near_rim_hit * 0.85 + far_rim_hit * 0.55;
        let mut weighted_strain_energy = 0.0f32;

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

            let intermode_drive = if k >= 2 {
                low_mode_strain * self.mode_v[k - 1] * self.radiation_burst_env
            } else {
                0.0
            };

            let f_mode = total_exciter_force * self.spatial_weight[k] * 0.065 + intermode_drive;
            let rad_loss = self.mode_rad_loss[k] * self.radiation_burst_env;
            let eff_damp = (self.mode_damp[k] * (1.0 - rad_loss)).clamp(0.92, 0.99998);

            let mut v = (self.mode_v[k] - omega * self.mode_w[k]) * eff_damp + f_mode;
            let mut w = self.mode_w[k] * eff_damp + omega * v;
            v = flush_denormal(v);
            w = flush_denormal(w);
            self.mode_v[k] = v;
            self.mode_w[k] = w;

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

            // Orthogonal sin(m*theta) doublet for every non-axisymmetric mode (m >= 1)
            if MODE_M[k] >= 1 {
                let d_hz = (mode_hz * self.doublet_detune[k]).min(nyquist_guard);
                let d_omega = (TAU * d_hz * self.inv_sr).min(1.85);
                let d_drive = total_exciter_force * self.doublet_weight[k] * 0.048;
                let mut dv = (self.doublet_v[k] - d_omega * self.doublet_w[k]) * eff_damp + d_drive;
                let mut dw = self.doublet_w[k] * eff_damp + d_omega * dv;
                dv = flush_denormal(dv);
                dw = flush_denormal(dw);
                self.doublet_v[k] = dv;
                self.doublet_w[k] = dw;

                let d_rad = dv * mode_gain * 0.45;
                let d_pan = -pan;
                top_skin_l += d_rad * (0.5 * (1.0 - d_pan)).sqrt();
                top_skin_r += d_rad * (0.5 * (1.0 + d_pan)).sqrt();
            }
        }

        // Upper skin-mode cloud
        let cloud_in = force_deriv.abs() * 0.55 + contact_force * 0.012 + transient_force.abs() * 0.35;
        let mut cloud_sum = 0.0f32;
        for b in 0..NUM_CLOUD_BANDS {
            let tilt = self.cloud_tilt[b];
            if tilt <= 0.0 && self.cloud_env[b] < 1e-7 {
                continue;
            }
            let env = flush_denormal(self.cloud_env[b] * self.cloud_damp[b] + cloud_in * tilt * 0.3);
            self.cloud_env[b] = env;
            let [a1, a2, a3] = self.cloud_coeffs[b];
            let x = rng.bipolar();
            let v3 = x - self.cloud_ic2[b];
            let v1 = a1 * self.cloud_ic1[b] + a2 * v3;
            let v2 = self.cloud_ic2[b] + a2 * self.cloud_ic1[b] + a3 * v3;
            self.cloud_ic1[b] = flush_denormal(2.0 * v1 - self.cloud_ic1[b]);
            self.cloud_ic2[b] = flush_denormal(2.0 * v2 - self.cloud_ic2[b]);
            let out = CLOUD_K * v1 * env;
            cloud_sum += out;
            if b % 2 == 0 {
                top_skin_l += out * 0.62;
                top_skin_r += out * 0.38;
            } else {
                top_skin_l += out * 0.38;
                top_skin_r += out * 0.62;
            }
        }

        self.last_cloud = cloud_sum;

        top_skin_l += self.deep_in[0];
        top_skin_r += self.deep_in[1];

        let e_coeff = if weighted_strain_energy > self.deflection_energy { 0.12 } else { 0.0025 };
        self.deflection_energy = flush_denormal(
            self.deflection_energy + e_coeff * (weighted_strain_energy - self.deflection_energy),
        );

        // 8. Hunt-Crossley Unilateral Gut-Snare / Birimintingo Sega-Ring Chatter + High Sizzle
        let buzz_amt = params.get(SOMA_BASE + SM_BUZZ_AMOUNT).clamp(0.0, 1.0);
        let mut buzz_sig = 0.0f32;
        if buzz_amt > 0.005 {
            let skin_disp = self.mode_w[0] + 0.72 * self.mode_w[1] + 0.45 * self.mode_w[2];
            let skin_vel = (self.mode_v[0] + 0.7 * self.mode_v[1] + 0.5 * self.mode_v[2]).abs();
            // Unilateral Hunt-Crossley collision of snare gut / sega iron ring against moving membrane
            let gap_pen = (skin_disp * 0.35 - self.snare_z).max(0.0);
            let rel_v = skin_disp * 120.0 - self.snare_v;
            let hc_impact = if gap_pen > 0.0 {
                (280.0 * gap_pen.powf(1.5) * (1.0 + 0.18 * rel_v).max(0.05)).min(3.5)
            } else {
                0.0
            };
            // Snare wire restoring spring tension (~215 Hz gut/wire bounce) + gravity/tension bias
            let snare_spring = -1800.0 * (self.snare_z - 0.0006) - 18.0 * self.snare_v;
            self.snare_v = flush_denormal((self.snare_v + (hc_impact + snare_spring) * self.inv_sr).clamp(-4.0, 4.0));
            self.snare_z = flush_denormal((self.snare_z + self.snare_v * self.inv_sr).clamp(-0.02, 0.04));

            let target_buzz = (skin_vel * 5.8 + hc_impact * 0.42).min(1.3);
            let b_coeff = if target_buzz > self.buzz_env { 0.28 } else { 0.0038 };
            self.buzz_env = flush_denormal(self.buzz_env + b_coeff * (target_buzz - self.buzz_env));

            let rattle_exc = rng.bipolar() * self.buzz_env + (hc_impact * 0.25).tanh();
            let f_buzz = (TAU * (2750.0 - 450.0 * heritage_age) * self.inv_sr).min(0.82);
            let hp = rattle_exc - self.buzz_z2 - 0.36 * self.buzz_z1;
            self.buzz_z1 = flush_denormal(self.buzz_z1 + f_buzz * hp);
            self.buzz_z2 = flush_denormal(self.buzz_z2 + f_buzz * self.buzz_z1);
            buzz_sig = (self.buzz_z1 * 0.72 + hp * 0.32 + (hc_impact * 0.16).tanh()) * buzz_amt * 0.55;
        }

        // 9. Domain III: Bidirectional Air Column Waveguide + Chisel Allpass Diffusion + Dual-Aperture Udu Hand
        let cavity_type_i = (params.get(SOMA_BASE + SM_CAVITY_TYPE).round() as i32).clamp(0, 5);
        let cavity_vol = params.get(SOMA_BASE + SM_CAVITY_VOLUME).clamp(0.05, 1.0);
        let port_tuning = params.get(SOMA_BASE + SM_PORT_TUNING).clamp(0.0, 1.0);
        let shell_warmth = params.get(SOMA_BASE + SM_SHELL_WARMTH).clamp(0.0, 1.0);

        let delay_samples = ((8.0 + 96.0 * cavity_vol) * (self.sample_rate / 48000.0))
            .clamp(6.0, (AIR_WAVEGUIDE_LEN - 2) as f32) as usize;
        let half_delay = (delay_samples / 2).max(3);
        let bot_idx = (self.air_write_idx + AIR_WAVEGUIDE_LEN - delay_samples) % AIR_WAVEGUIDE_LEN;
        let mid_idx = (self.air_write_idx + AIR_WAVEGUIDE_LEN - half_delay) % AIR_WAVEGUIDE_LEN;

        let waist_refl_coeff = match cavity_type_i {
            0 => 0.18,
            1 => 0.46,
            2 => -0.22,
            3 => 0.52,
            4 => -0.18,
            _ => 0.0,
        };

        let down_at_mid = self.air_down[mid_idx];
        let down_at_bot = self.air_down[bot_idx];
        let up_at_top = self.air_up[bot_idx];

        // Dual-aperture Udu / Ghatam / Goblet hand-occlusion lowers Helmholtz frequency f_H ~ sqrt(S_eff)
        let hand_occ = self.aperture_smooth;
        let aperture_pitch_scale = (1.0 - 0.76 * hand_occ).max(0.24).sqrt();

        let p_track = self.base_freq_hz * self.pedal_ratio_smooth;
        let cavity_res_hz = match cavity_type_i {
            0 => (p_track * (0.76 + 0.32 * port_tuning) / (0.65 + 0.55 * cavity_vol)).clamp(42.0, 380.0),
            1 => ((p_track * 0.48 + 42.0) * (0.82 + 0.42 * port_tuning)) / (0.62 + 0.58 * cavity_vol),
            2 => ((p_track * 0.52 + 48.0) * (0.84 + 0.38 * port_tuning)) / (0.65 + 0.55 * cavity_vol),
            3 => p_track * (0.88 + 0.24 * port_tuning),
            4 => ((p_track * 0.44 + 26.0) * (0.80 + 0.44 * port_tuning)) / (0.70 + 0.55 * cavity_vol),
            _ => (p_track * 0.72 + 115.0 + 130.0 * port_tuning) / (0.75 + 0.45 * cavity_vol),
        } * aperture_pitch_scale;

        let omega_cav = (TAU * cavity_res_hz.min(nyquist_guard) * self.inv_sr).min(1.4);
        let cav_t60 = match cavity_type_i {
            0 => 0.55,
            1 => 0.34 + 0.22 * hand_occ, // Partially cupped clay/goblet aperture blooms sub-bass sustain!
            2 => 0.30 + 0.14 * hand_occ,
            3 => 0.38,
            4 => 0.62,
            _ => 0.12,
        };
        let base_cav_damp = (-(6.907_755 / cav_t60) * self.inv_sr).exp();
        let vortex_loss = (self.cavity_v.abs() * (0.0025 + 0.002 * craft_asym)).min(0.0045);
        let eff_cav_damp = (base_cav_damp - vortex_loss).max(0.985);

        let air_drive = (axisym_vol_vel * 0.28 + down_at_bot * 0.16 + direct_piston_wave * 0.12) * omega_cav;
        self.cavity_v = flush_denormal((self.cavity_v - omega_cav * self.cavity_w) * eff_cav_damp + air_drive);
        self.cavity_w = flush_denormal(self.cavity_w * eff_cav_damp + omega_cav * self.cavity_v);

        let mut bottom_port_radiation = (self.cavity_v - self.air_port_lp * 0.35) * (1.0 - 0.45 * hand_occ);
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

        self.air_port_lp = flush_denormal(self.air_port_lp + 0.18 * (down_at_bot - self.air_port_lp));
        // Hand-occluded port reflects more positive pressure back up the vessel instead of open-end inversion
        let open_refl = -0.56 * (1.0 - 1.45 * hand_occ);
        let bottom_refl = match cavity_type_i {
            0 => 0.58 * down_at_bot,
            3 | 4 => 0.48 * self.res_head_v,
            5 => -0.15 * self.air_port_lp,
            _ => open_refl * self.air_port_lp,
        };

        let mut raw_down = axisym_vol_vel * 0.45 + direct_piston_wave * 0.25 + up_at_top * 0.25;
        let mut raw_up = bottom_refl + down_at_mid * waist_refl_coeff;

        // Spiral hand-adze chisel facets inside carved hardwood/clay goblets diffuse standing-wave harshness
        if craft_asym > 0.01 {
            let g_ap = 0.28 * craft_asym;
            let ap_d = -g_ap * raw_down + self.chisel_ap_z1;
            self.chisel_ap_z1 = flush_denormal(raw_down + g_ap * ap_d);
            raw_down = ap_d;

            let ap_u = -g_ap * raw_up + self.chisel_ap_z2;
            self.chisel_ap_z2 = flush_denormal(raw_up + g_ap * ap_u);
            raw_up = ap_u;
        }

        let compress_drive = 1.0 + 1.8 * shell_warmth;
        self.air_down[self.air_write_idx] = flush_denormal(soft_clip(raw_down * compress_drive) / compress_drive);
        self.air_up[self.air_write_idx] = flush_denormal(soft_clip(raw_up * compress_drive) / compress_drive);
        self.air_write_idx = (self.air_write_idx + 1) % AIR_WAVEGUIDE_LEN;

        // 10. Domain IV: Seasoned Wood / Hammered Copper / Fired Clay Shell Wall Structural Modes
        let shell_mat = (params.get(SOMA_BASE + SM_SHELL_MATERIAL).round() as i32).clamp(0, 4);
        let shell_res = params.get(SOMA_BASE + SM_SHELL_RESONANCE).clamp(0.0, 1.0);
        let (shell_freqs, base_shell_t60): ([f32; NUM_SHELL_MODES], f32) = match shell_mat {
            0 => ([285.0, 640.0, 1380.0, 2650.0], 0.075),
            1 => ([390.0, 980.0, 2240.0, 4200.0], 0.165),
            2 => ([225.0, 520.0, 1140.0, 2280.0], 0.082),
            3 => ([350.0, 890.0, 2120.0, 3950.0], 0.115),
            _ => ([205.0, 480.0, 1060.0, 2380.0], 0.065),
        };
        // Seasoned aged hardwood/stave shells lose bound moisture (higher E_L/rho -> +4.5% modal pitch, +18% Q)
        let wood_age_scale = if shell_mat == 0 || shell_mat == 2 || shell_mat == 4 {
            1.0 + 0.045 * heritage_age
        } else {
            1.0
        };
        let shell_t60 = base_shell_t60 * (1.0 + 0.18 * heritage_age);

        let size_scale = (1.35 - 0.65 * params.get(SOMA_BASE + SM_HEAD_DIAMETER).clamp(0.0, 1.0)) * wood_age_scale;
        let shell_drive = (rim_shear_force * 0.55 + direct_piston_wave * 0.45 + self.cavity_v * 0.25) * shell_res;
        let mut shell_rad_l = 0.0f32;
        let mut shell_rad_r = 0.0f32;

        if shell_res > 0.005 {
            for s in 0..NUM_SHELL_MODES {
                let craft_shell_det = 1.0 + craft_asym * 0.025 * ((s as f32) * 1.7 - 2.1).sin();
                let f_s = (shell_freqs[s] * size_scale * craft_shell_det).min(nyquist_guard);
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

        // 11. Acoustic Radiation Field
        let mic_persp = params.get(SOMA_BASE + SM_MIC_PERSPECTIVE).clamp(0.0, 1.0);
        let top_gain = 1.15 - 0.38 * mic_persp;
        let port_gain = if cavity_type_i == 0 {
            0.12 * mic_persp * cavity_coupling
        } else {
            (0.45 + 0.95 * mic_persp) * (0.45 + 0.55 * cavity_coupling)
        };
        let shell_gain = (0.45 + 0.65 * mic_persp) * shell_res;

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

        let room_early = params.get(SOMA_BASE + SM_ROOM_EARLY).clamp(0.0, 1.0);
        if room_early > 0.005 {
            // Decorrelated stereo early reflections (8.8 - 18.5 ms at 48 kHz) replacing 1 ms metallic comb.
            let sr_s = (self.sample_rate / 48000.0).clamp(0.25, 1.05);
            let t1_l = ((421.0 * sr_s) as usize).clamp(16, EARLY_ROOM_LEN - 2);
            let t2_l = ((751.0 * sr_s) as usize).clamp(32, EARLY_ROOM_LEN - 2);
            let t1_r = ((509.0 * sr_s) as usize).clamp(16, EARLY_ROOM_LEN - 2);
            let t2_r = ((887.0 * sr_s) as usize).clamp(32, EARLY_ROOM_LEN - 2);
            let tap1_l = self.early_buf_l[(self.early_idx + EARLY_ROOM_LEN - t1_l) % EARLY_ROOM_LEN];
            let tap2_l = self.early_buf_r[(self.early_idx + EARLY_ROOM_LEN - t2_l) % EARLY_ROOM_LEN];
            let tap1_r = self.early_buf_r[(self.early_idx + EARLY_ROOM_LEN - t1_r) % EARLY_ROOM_LEN];
            let tap2_r = self.early_buf_l[(self.early_idx + EARLY_ROOM_LEN - t2_r) % EARLY_ROOM_LEN];

            self.early_buf_l[self.early_idx] = flush_denormal(out_l * 0.68 + tap2_l * 0.08);
            self.early_buf_r[self.early_idx] = flush_denormal(out_r * 0.68 + tap2_r * 0.08);
            self.early_idx = (self.early_idx + 1) % EARLY_ROOM_LEN;

            let refl_mix = room_early * 0.34;
            out_l += (tap1_l * 0.64 + tap2_l * 0.36) * refl_mix;
            out_r += (tap1_r * 0.64 + tap2_r * 0.36) * refl_mix;
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
