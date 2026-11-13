//! ARCO — the orchestral string family as strings: violin, viola, cello and double bass, solo, in
//! sections of any size, as a quartet or quintet, or as a whole string orchestra.
//!
//! Every player is simulated. A note played by a section of twelve is up to eight physical
//! strings (the rest are represented in level and spread), each under its own bow: its own speed,
//! force and sound point, its own intonation drifting and being corrected, its own vibrato, its own
//! moment of arrival, its own bow changes when its bow runs out, and its own instrument — a body
//! whose low modes sit a few percent away from its desk partner's. That is what makes a section
//! sound like a section and not like a chorus effect.
//!
//! The string is TONOS's velocity-wave loop (exact period, Valette losses, wound strings, the
//! moving bridge fed back through the body's modal admittance), bowed with:
//!   · McIntyre–Schumacher–Woodhouse stick-slip with a hyperbolic friction curve, its force placed
//!     inside Schelleng's window from the bow speed and sound point;
//!   · torsional waves: the bow grips the string's surface, which moves with the transverse
//!     velocity plus the string's twist. A second, faster, lossier loop carries the torsion; the
//!     friction force is shared between them by impedance (Z_r/Z_t = c_tor/2c for a solid string).
//!     Torsion is what cleans up a Helmholtz attack and puts the bow's grain into the tone;
//!   · thermal friction: rosin softens as slipping heats it and recovers while it sticks
//!     (after Smith & Woodhouse), so attacks and bow noise behave like rosin, not like a formula;
//!   · the bow is a real length: a long note runs out of bow and changes direction, with the
//!     brief loss of force that an audible bow change is.
//!
//! The body's low, bridge-coupled modes (A0, CBR, B1−, B1+ …, measured families after Bissinger
//! and Jansson) stay in the loop. Its dense upper modes — the bridge hill that makes a violin a
//! violin — are a synthesised mode cloud played by convolution on the summed bridge forces
//! (`bodyconv`), so they work for a live bow, cost the same for a soloist or a full section, and
//! move when a mute goes on the bridge.
//!
//! Everything allocates at construction.

use crate::bodyconv::{render_cloud, BodyConv, ModeCloud};
use crate::perform::{Vibrato, Wander};
use crate::osc::Rng;
use crate::params::*;
use crate::tonos::{design_loss, onepole_pd, Bp, Loop, Material, StringSpec, GUT, MATERIALS, NSTEEL, STEEL, STOP_FRETLESS};
use std::f32::consts::PI;

const TAU: f32 = 2.0 * PI;

pub const NUM_INSTRUMENTS: usize = 4;
pub const INSTRUMENT_NAMES: [&str; NUM_INSTRUMENTS] = ["Violin", "Viola", "Cello", "Double bass"];
pub const SECTION_SIZES: [usize; 10] = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16];
pub const ENSEMBLE_NAMES: [&str; 5] = ["One instrument", "String quartet", "String quintet", "Chamber string orchestra", "Full string orchestra"];
pub const ARTIC_NAMES: [&str; 11] =
    ["Sustain", "Détaché", "Spiccato", "Pizzicato", "Col legno", "Tremolo", "Harmonics", "Sul ponticello", "Sul tasto", "Marcato", "Bartók pizz"];
pub const STRING_SET_NAMES: [&str; 3] = ["Synthetic core", "Gut", "Steel"];

const A_SUSTAIN: usize = 0;
const A_DETACHE: usize = 1;
const A_SPICCATO: usize = 2;
const A_PIZZ: usize = 3;
const A_LEGNO: usize = 4;
const A_TREMOLO: usize = 5;
const A_HARMONIC: usize = 6;
const A_PONT: usize = 7;
const A_TASTO: usize = 8;
const A_MARCATO: usize = 9;
const A_SNAP: usize = 10;

pub const MAX_PLAYERS: usize = 8;
const MAX_MODES: usize = 10;
const TBUF: usize = 4096; // transverse loop: E1 at 96 kHz fits twice
const RBUF: usize = 2048; // torsional loop

/// One instrument of the family, as built.
struct Fiddle {
    opens: &'static [f32],
    len: f32,
    tensions: &'static [f32],
    bow_len: f32,
    beta: f32, // normal sound point (fraction of the string from the bridge)
    modes: &'static [(f32, f32, f32)], // (Hz, Q, gain): the low, bridge-coupled body modes
    y0: f32,
    // Deep body (upper mode cloud).
    cross: f32,
    density: f32,
    eta: f32,
    peaks: &'static [(f32, f32, f32)],
    floor: f32,
    level: f32,
    range: (f32, f32), // comfortable range (MIDI), for ensembles
}

#[rustfmt::skip]
static FIDDLES: [Fiddle; NUM_INSTRUMENTS] = [
    // Violin: G3 D4 A4 E5 on a 328 mm string; A0 ≈ 275 Hz, B1− / B1+ ≈ 470 / 540 Hz; bridge hill 2.4–3 kHz.
    Fiddle { opens: &[55.0, 62.0, 69.0, 76.0], len: 0.328, tensions: &[44.0, 44.0, 50.0, 75.0], bow_len: 0.65, beta: 0.11,
        modes: &[(275.0, 12.0, 0.7), (405.0, 25.0, 0.45), (470.0, 30.0, 1.0), (540.0, 28.0, 1.0), (650.0, 30.0, 0.5), (750.0, 32.0, 0.45), (860.0, 32.0, 0.4), (950.0, 34.0, 0.35)],
        y0: 3.0e-3, cross: 1000.0, density: 0.030, eta: 0.022, peaks: &[(2600.0, 0.7, 0.45), (4400.0, 0.2, 0.35)], floor: 0.22, level: 1.0, range: (62.0, 96.0) },
    // Viola: C3 G3 D4 A4 on ~375 mm; the body is too small for its range, so A0 and B1 sit high (230 / 400–480 Hz).
    Fiddle { opens: &[48.0, 55.0, 62.0, 69.0], len: 0.375, tensions: &[50.0, 45.0, 45.0, 60.0], bow_len: 0.66, beta: 0.11,
        modes: &[(230.0, 12.0, 0.7), (340.0, 25.0, 0.45), (400.0, 30.0, 1.0), (480.0, 28.0, 0.95), (560.0, 30.0, 0.5), (660.0, 32.0, 0.45), (760.0, 32.0, 0.4), (840.0, 34.0, 0.35)],
        y0: 2.6e-3, cross: 900.0, density: 0.036, eta: 0.024, peaks: &[(2000.0, 0.6, 0.5), (3600.0, 0.15, 0.35)], floor: 0.22, level: 1.0, range: (53.0, 81.0) },
    // Cello: C2 G2 D3 A3 on 690 mm; A0 ≈ 100 Hz; the B1+ mode near 176 Hz is where cellos keep their wolf.
    Fiddle { opens: &[36.0, 43.0, 50.0, 57.0], len: 0.69, tensions: &[130.0, 125.0, 125.0, 150.0], bow_len: 0.71, beta: 0.10,
        modes: &[(102.0, 12.0, 0.7), (145.0, 25.0, 0.5), (176.0, 45.0, 1.2), (220.0, 30.0, 0.9), (290.0, 30.0, 0.6), (380.0, 30.0, 0.5), (480.0, 30.0, 0.45), (560.0, 32.0, 0.4), (640.0, 34.0, 0.35)],
        y0: 1.6e-3, cross: 700.0, density: 0.060, eta: 0.026, peaks: &[(1100.0, 0.6, 0.5), (2100.0, 0.4, 0.5)], floor: 0.22, level: 1.0, range: (36.0, 69.0) },
    // Double bass: E1 A1 D2 G2 on 1.06 m (orchestral steel); A0 ≈ 62 Hz.
    Fiddle { opens: &[28.0, 33.0, 38.0, 43.0], len: 1.06, tensions: &[330.0, 300.0, 290.0, 280.0], bow_len: 0.70, beta: 0.10,
        modes: &[(62.0, 12.0, 0.7), (95.0, 25.0, 0.6), (118.0, 35.0, 1.0), (150.0, 30.0, 0.9), (200.0, 30.0, 0.6), (260.0, 30.0, 0.5), (330.0, 30.0, 0.45), (410.0, 32.0, 0.4)],
        y0: 0.9e-3, cross: 500.0, density: 0.090, eta: 0.030, peaks: &[(650.0, 0.6, 0.6), (1400.0, 0.3, 0.5)], floor: 0.22, level: 1.0, range: (28.0, 55.0) },
];

/// Standard section sizes in the ensembles (violins I, violins II, violas, cellos, basses).
const CHAMBER: [usize; 5] = [6, 5, 4, 3, 2];
const FULL: [usize; 5] = [16, 14, 12, 10, 8];
const SECTION_INST: [usize; 5] = [0, 0, 1, 2, 3];

#[inline]
fn p01(p: &Params, id: u32) -> f32 {
    p.get(ARCO_BASE + id).clamp(0.0, 1.0)
}
#[inline]
fn pidx(p: &Params, id: u32, n: usize) -> usize {
    (p.get(ARCO_BASE + id).round().max(0.0) as usize).min(n.saturating_sub(1))
}
#[inline]
fn hz_to_midi(f: f32) -> f32 {
    69.0 + 12.0 * (f / 440.0).log2()
}
#[inline]
fn midi_to_hz(n: f32) -> f32 {
    440.0 * 2f32.powf((n - 69.0) / 12.0)
}

fn material_for(inst: usize, set: usize, string: usize, nstrings: usize) -> u8 {
    match set {
        1 => GUT,
        2 => STEEL,
        _ => {
            if inst == 3 || (inst == 0 && string + 1 == nstrings) {
                STEEL // basses are steel; a violin's E is plain steel
            } else {
                NSTEEL
            }
        }
    }
}

/// The string a note is played on, and the physics of that string.
fn string_for(fd: &Fiddle, inst: usize, set: usize, note_hz: f32, pref: f32, tension_scale: f32) -> (StringSpec, u8) {
    let note = hz_to_midi(note_hz);
    let n = fd.opens.len();
    let mut si = 0;
    for (i, &o) in fd.opens.iter().enumerate() {
        if o <= note + 0.01 {
            si = i;
        }
    }
    // Staying on a lower string (sul G / sul C): as far as the hand is willing to shift.
    let reach = 7.0 + 12.0 * pref;
    for (i, &o) in fd.opens.iter().enumerate() {
        if o <= note + 0.01 && note - o <= reach {
            si = i;
            break;
        }
    }
    let mat_i = material_for(inst, set, si, n);
    let mat: &Material = &MATERIALS[mat_i as usize];
    let f_open = midi_to_hz(fd.opens[si]);
    let mut t = fd.tensions[si.min(fd.tensions.len() - 1)] * tension_scale;
    let f_loop = note_hz;
    let (l_open, f_wave, l_stop) = if note_hz < f_open {
        let r = note_hz / f_open;
        t *= r * r;
        (fd.len, note_hz, fd.len)
    } else {
        (fd.len, f_open, (fd.len * f_open / note_hz).max(fd.len * 0.05))
    };
    // Wave speed from the open string: c = 2·L·f_open.
    let c = 2.0 * l_open * f_wave;
    let mu = t / (c * c);
    let d = (4.0 * mu / (PI * mat.rho)).sqrt();
    let b_plain = PI * PI * PI * mat.e * d.powi(4) / (64.0 * t * l_stop * l_stop);
    let mut wound = 1.0;
    if mat.e > 2.0e9 && b_plain > 6.0e-4 {
        wound = (b_plain / 3.0e-4).sqrt().clamp(1.0, 8.0);
    }
    let dc = (4.0 * mu / wound / (PI * mat.rho)).sqrt();
    let b = PI * PI * PI * mat.e * dc.powi(4) / (64.0 * t * l_stop * l_stop);
    (StringSpec { f: note_hz, f_loop, l_open, l_stop, t, mu, d, dc, wound, c, z0: (t * mu).sqrt(), b, harmonic: 1 }, mat_i)
}

/// What a voice plays: which instrument, how many players, where they sit.
#[derive(Clone, Copy, Debug)]
pub struct Role {
    pub inst: usize,
    pub section: usize, // 0 vln I, 1 vln II, 2 vla, 3 vc, 4 db (seating)
    pub players: usize, // represented
    pub bus: usize,     // deep-body bus
}

impl Default for Role {
    fn default() -> Self {
        Role { inst: 0, section: 0, players: 1, bus: 0 }
    }
}

/// One player: a string under a bow, on an instrument of their own.
struct Player {
    tl: Loop,
    rl: Loop,
    torsion: bool,
    kappa: f32, // Z_r / Z_t
    spec: StringSpec,
    modes: [Bp; MAX_MODES],
    mode_g: [f32; MAX_MODES],
    nmodes: usize,
    y0: f32,
    p_prev: f32,
    // bow state
    m_t: usize,
    m_r: usize,
    beta: f32,
    v_b: f32,
    f_b: f32,
    dir: f32,
    bow_x: f32,
    change: f32, // 0 → 1 while changing bow
    theta: f32,  // rosin heat
    env: f32,
    // humanising
    onset: u32,
    cents: f32,
    drift: f32,
    vib_rate: f32,
    vib_phase: f32,
    vib_c: f32,
    vib_s: f32,
    vib_rc: f32,
    vib_rs: f32,
    vib_depth: f32,
    vib_delay: f32,
    speed_k: f32,
    force_k: f32,
    pan_l: f32,
    pan_r: f32,
    gain: f32,
    // percussive excitations
    ham_on: bool,
    ham_y: f32,
    ham_v: f32,
    y_ex: f32,
    trem_phase: f32,
    trem_rate: f32,
    touch_m: usize,
    noise_lp: f32,
    bow_h: usize,
    bow_w: [f32; 5],
    bow_sw2: f32,
    // the player's life: slow wander of bow pressure/speed and pitch, a living vibrato
    wander_a: Wander,
    wander_p: Wander,
    vib: Vibrato,
    ctl_cents: f32,
    ctl_cents_t: f32,
    ctl_amp: f32,
}

impl Player {
    fn new() -> Self {
        Player {
            tl: Loop::with_len(TBUF),
            rl: Loop::with_len(RBUF),
            torsion: false,
            kappa: 2.0,
            spec: StringSpec::default(),
            modes: [Bp::default(); MAX_MODES],
            mode_g: [0.0; MAX_MODES],
            nmodes: 0,
            y0: 1e-3,
            p_prev: 0.0,
            m_t: 4,
            m_r: 2,
            beta: 0.1,
            v_b: 0.0,
            f_b: 0.0,
            dir: 1.0,
            bow_x: 0.0,
            change: 1.0,
            theta: 0.0,
            env: 0.0,
            onset: 0,
            cents: 0.0,
            drift: 0.0,
            vib_rate: 5.5,
            vib_phase: 0.0,
            vib_c: 1.0,
            vib_s: 0.0,
            vib_rc: 1.0,
            vib_rs: 0.0,
            vib_depth: 1.0,
            vib_delay: 0.3,
            speed_k: 1.0,
            force_k: 1.0,
            pan_l: 1.0,
            pan_r: 1.0,
            gain: 1.0,
            ham_on: false,
            ham_y: 0.0,
            ham_v: 0.0,
            y_ex: 0.0,
            trem_phase: 0.0,
            trem_rate: 0.0,
            touch_m: 0,
            noise_lp: 0.0,
            bow_h: 0,
            bow_w: [1.0, 0.0, 0.0, 0.0, 0.0],
            bow_sw2: 1.0,
            wander_a: Wander::new(3000.0),
            wander_p: Wander::new(3000.0),
            vib: Vibrato::default(),
            ctl_cents: 0.0,
            ctl_cents_t: 0.0,
            ctl_amp: 1.0,
        }
    }
    fn clear(&mut self) {
        self.tl.clear();
        self.rl.clear();
        for m in self.modes.iter_mut() {
            m.z1 = 0.0;
            m.z2 = 0.0;
        }
        self.p_prev = 0.0;
        self.env = 0.0;
        self.theta = 0.0;
        self.ham_on = false;
        self.y_ex = 0.0;
        self.change = 1.0;
        self.noise_lp = 0.0;
    }
}

/// Age of the returning wave at distance m: the loop's true round trip (read + 1 + filter delay)
/// minus m, fractional.
#[inline]
fn back_pos(l: &Loop, m: usize) -> f32 {
    (l.read + 1.0 + l.pd - m as f32).max(m as f32 + 1.0)
}
/// Lagrange (3rd-order) weights for a fractional age b: taps at i−1, i, i+1, i+2.
#[inline]
fn lag_w(b: f32) -> (usize, [f32; 4]) {
    let i = b.floor();
    let t = 1.0 + (b - i);
    let h0 = -(t - 1.0) * (t - 2.0) * (t - 3.0) / 6.0;
    let h1 = t * (t - 2.0) * (t - 3.0) / 2.0;
    let h2 = -t * (t - 1.0) * (t - 3.0) / 2.0;
    let h3 = t * (t - 1.0) * (t - 2.0) / 6.0;
    ((i as usize).max(1), [h0, h1, h2, h3])
}
/// Point velocity at m (outgoing minus returning wave), the returning one interpolated.
#[inline]
fn back_vel(l: &Loop, m: usize) -> f32 {
    let (i, h) = lag_w(back_pos(l, m).max(2.0));
    l.age(m) - (l.age(i - 1) * h[0] + l.age(i) * h[1] + l.age(i + 1) * h[2] + l.age(i + 2) * h[3])
}
/// A velocity change dv at m: into the outgoing wave, and out of the returning one with the
/// same interpolation weights (transposed), so what the bow reads is what it changes.
#[inline]
fn kick_frac(l: &mut Loop, m: usize, b: f32, dv: f32) {
    let (i, h) = lag_w(b.max(2.0));
    l.add(m, dv);
    l.add(i - 1, -dv * h[0]);
    l.add(i, -dv * h[1]);
    l.add(i + 1, -dv * h[2]);
    l.add(i + 2, -dv * h[3]);
}

fn tune(l: &mut Loop, period: f32, g: f32, b: f32) {
    let w = TAU / period;
    l.g = g;
    l.b = b;
    l.nap = 0;
    l.pd = onepole_pd(b, w);
    l.period = period;
    l.target = period;
    l.read = (period - 1.0 - l.pd).max(1.0);
}

/// Release the static shape a point force leaves (TONOS's pluck), over a contact width.
fn pluck(l: &mut Loop, amp: f32, m_p: f32, width: f32, sr: f32) {
    let n = l.period * 0.5;
    let m_p = m_p.clamp(1.0, n - 1.0);
    let s1 = amp / m_p;
    let s2 = -amp / (n - m_p);
    let w = width.max(0.5);
    let last = ((l.read + 3.0) as usize).min(l.mask - 1);
    for a in 0..last {
        let pos = if (a as f32) <= n { a as f32 } else { l.period - a as f32 };
        if pos < 0.0 {
            continue;
        }
        let t = ((pos - (m_p - 0.5 * w)) / w).clamp(0.0, 1.0);
        let t = t * t * (3.0 - 2.0 * t);
        l.add(a, -0.5 * sr * (s1 + (s2 - s1) * t));
    }
}

/// Bow speed curve for a dynamic (m/s before the player's own factor).
#[inline]
fn speed_curve(dyn_: f32) -> f32 {
    0.06 + 0.5 * dyn_.powf(1.3)
}

/// Bow speed (m/s) and force (N) for a dynamic, inside Schelleng's window.
fn bow_for(artic: usize, mu_s: f32, mu_d: f32, pl: &Player, p: &Params, dyn_: f32) -> (f32, f32) {
    let speed = 2f32.powf((p01(p, AR_BOW_SPEED) - 0.5) * 1.5);
    let mut v_b = speed_curve(dyn_) * speed * pl.speed_k;
    let mut frac = 0.16 + 0.42 * p01(p, AR_BOW_FORCE) + 0.12 * dyn_;
    match artic {
        // Near the bridge the window narrows from below too (F_min ∝ 1/β²): players speed up
        // the bow rather than press.
        A_PONT => {
            frac *= 0.85;
            v_b *= 1.4;
        }
        A_TASTO => {
            frac *= 0.55;
            v_b *= 1.2;
        }
        _ => {}
    }
    let fmax = 2.0 * pl.spec.z0 * v_b / (pl.beta.max(0.02) * (mu_s - mu_d));
    (v_b, fmax * frac.clamp(0.05, 0.9) * pl.force_k)
}

pub struct ArcoVoice {
    sr: f32,
    players: Vec<Player>,
    np: usize,
    pub role: Role,
    inst: usize,
    artic: usize,
    mat: u8,
    vel: f32,
    dyn_: f32,
    mod_dyn: bool,
    expr: f32,
    expr_init: bool,
    bend: f32,
    glide: f32,
    vib_amt: f32,
    vib_base_rate: f32,
    bow_len: f32,
    release_rate: f32,
    release_damp: f32,
    mu_s: f32,
    mu_d: f32,
    rosin_soft: f32,
    norm: f32,
    t: u32,
    released: bool,
    level: f32,
    /// This sample's summed bridge force (already scaled), for the deep-body bus.
    pub bus_out: f32,
}

impl ArcoVoice {
    pub fn new(sr: f32) -> Self {
        ArcoVoice {
            sr,
            players: (0..MAX_PLAYERS).map(|_| Player::new()).collect(),
            np: 1,
            role: Role::default(),
            inst: 0,
            artic: 0,
            mat: NSTEEL,
            vel: 0.0,
            dyn_: 0.5,
            mod_dyn: false,
            expr: 0.0,
            expr_init: false,
            bend: 1.0,
            glide: 1.0,
            vib_amt: 0.0,
            vib_base_rate: 5.5,
            bow_len: 0.65,
            release_rate: 0.01,
            release_damp: 0.01,
            mu_s: 0.8,
            mu_d: 0.3,
            rosin_soft: 0.3,
            norm: 1.0,
            t: 0,
            released: true,
            level: 0.0,
            bus_out: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr;
    }

    pub fn reset(&mut self) {
        for pl in self.players.iter_mut() {
            pl.clear();
        }
        self.level = 0.0;
        self.released = true;
        self.t = 0;
        self.bus_out = 0.0;
    }

    pub fn samples(&self) -> u32 {
        self.t
    }
    pub fn is_bowed(&self) -> bool {
        !matches!(self.artic, A_PIZZ | A_LEGNO | A_SNAP)
    }
    pub fn is_quiet(&self) -> bool {
        if self.is_bowed() && !self.released && !matches!(self.artic, A_SPICCATO) {
            return false;
        }
        self.t as f32 > self.sr * 0.1 && self.level < 1.5e-5
    }

    fn sound_point(&self, p: &Params, fd: &Fiddle) -> f32 {
        let pos = p01(p, AR_BOW_POS);
        let mut beta = fd.beta * 2f32.powf((0.5 - pos) * 2.4);
        beta *= 1.0 - 0.3 * (self.dyn_ - 0.5); // forte: nearer the bridge
        match self.artic {
            A_PONT => beta = 0.035,
            A_TASTO => beta = 0.2,
            _ => {}
        }
        beta.clamp(0.025, 0.25)
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        self.reset();
        self.released = false;
        let sr = self.sr;
        self.vel = velocity.clamp(0.0, 1.0);
        self.inst = self.role.inst.min(NUM_INSTRUMENTS - 1);
        let fd = &FIDDLES[self.inst];
        self.artic = pidx(p, AR_ARTIC, ARTIC_NAMES.len());
        self.mod_dyn = p01(p, AR_MOD_DYN) > 0.5;
        let vs = p01(p, AR_VEL_SENS);
        let v = 1.0 - vs + vs * self.vel;
        // With the mod wheel as dynamics the note is voiced at a reference mf and the wheel scales it
        // from there (the wheel's real value arrives on the first sample).
        self.expr_init = false;
        self.dyn_ = if self.mod_dyn { 0.5 } else { (v * (0.4 + 1.2 * p01(p, AR_DYNAMICS))).clamp(0.02, 1.0) };
        let set = pidx(p, AR_STRING_SET, STRING_SET_NAMES.len());
        let tension = 2f32.powf((p01(p, AR_TENSION) - 0.5) * 1.0);
        let pref = p01(p, AR_STRING_PREF);
        let f = note_hz.clamp(20.0, sr * 0.3);
        let rosin = p01(p, AR_ROSIN);
        self.mu_s = 0.65 + 0.35 * rosin;
        self.mu_d = 0.28 + 0.06 * rosin;
        self.rosin_soft = 0.15 + 0.4 * rosin;
        self.bow_len = fd.bow_len * 2.0 * p01(p, AR_BOW_LENGTH);
        self.release_rate = 1.0 / (sr * (0.012 + 0.25 * p01(p, AR_RELEASE).powi(2)));
        // After the bow leaves, a stopped string rings on for ~0.5–1.5 s (the finger stays down).
        self.release_damp = 0.0016 + 0.006 * (1.0 - p01(p, AR_RELEASE));
        let port = p01(p, AR_PORTAMENTO);
        self.glide = 1.0 - (-1.0 / (sr * (0.006 + 0.3 * port * port))).exp();
        self.vib_amt = p01(p, AR_VIB_DEPTH);
        self.vib_base_rate = 4.6 + 2.2 * p01(p, AR_VIB_RATE);
        let vib_spread = p01(p, AR_VIB_SPREAD);
        let intonation = p01(p, AR_INTONATION);
        let tight = p01(p, AR_TIGHTNESS);
        let torsion = p01(p, AR_TORSION) * 2.0;
        let body = 4f32.powf(p01(p, AR_BODY) - 0.5);
        let mute = p01(p, AR_MUTE);
        let quality = p01(p, AR_QUALITY);
        let width = p01(p, AR_WIDTH);
        let seating = pidx(p, AR_SEATING, 2);

        // Harmonics: artificial (stopped two octaves down, touched a fourth above) when the stop
        // is on the fingerboard, else a natural harmonic of an open string.
        let mut f_string = f;
        let mut harm_n = 1u32;
        if self.artic == A_HARMONIC {
            if f / 4.0 >= midi_to_hz(fd.opens[0]) {
                f_string = f / 4.0;
                harm_n = 4;
            } else {
                for n in 2..=6u32 {
                    let fs = f / n as f32;
                    if fd.opens.iter().any(|&o| (hz_to_midi(fs) - o).abs() < 0.35) {
                        f_string = fs;
                        harm_n = n;
                        break;
                    }
                }
            }
        }

        let (spec, mat) = string_for(fd, self.inst, set, f_string, pref, tension);
        self.mat = mat;
        let material = &MATERIALS[mat as usize];

        // How many players we simulate, and how loud each one is.
        let rep = self.role.players.max(1);
        let cap = 1 + (quality * (MAX_PLAYERS - 1) as f32).round() as usize;
        self.np = rep.min(cap).min(MAX_PLAYERS);
        let each = (rep as f32).powf(0.25) / (self.np as f32).sqrt();

        // Seating: the section's place on the stage.
        let centre: f32 = match (seating, self.role.section) {
            (_, 0) => -0.65,
            (0, 1) => -0.3,
            (1, 1) => 0.65,
            (0, 2) => 0.25,
            (1, 2) => 0.15,
            (0, 3) => 0.5,
            (1, 3) => -0.2,
            (0, _) => 0.75,
            (_, _) => -0.45,
        };
        let solo = rep == 1 && self.role.section == 0;
        let centre = if solo { 0.0 } else { centre * (0.4 + 0.6 * width) };

        let damp = 1.0;
        let base_period = sr / spec.f_loop;
        let beta0 = self.sound_point(p, fd);
        let n_stop = base_period * 0.5;
        let n_open = n_stop * spec.l_open / spec.l_stop;
        let c_tor = (material.e / 2.6 / material.rho).sqrt() / spec.wound.sqrt();
        let ratio = (c_tor / spec.c).clamp(2.0, 9.0);
        let dyn_ = self.dyn_;
        let (artic, mu_s, mu_d, bow_len, bowed) = (self.artic, self.mu_s, self.mu_d, self.bow_len, self.is_bowed());
        for k in 0..self.np {
            let pl = &mut self.players[k];
            pl.clear();
            pl.spec = spec;
            // Who this player is: a different instrument, hand and ear.
            let lead = k == 0;
            let hum = if rep == 1 { 0.35 } else { 1.0 };
            pl.cents = if lead && rep == 1 { 0.0 } else { rng.bipolar() * (1.0 + 9.0 * intonation) * hum };
            pl.drift = 0.0;
            pl.vib_rate = self.vib_base_rate * (1.0 + rng.bipolar() * 0.12 * (0.3 + vib_spread) * hum);
            pl.vib_phase = rng.next_f32() * TAU;
            pl.vib_c = pl.vib_phase.cos();
            pl.vib_s = pl.vib_phase.sin();
            let w = TAU * pl.vib_rate / sr;
            pl.vib_rc = w.cos();
            pl.vib_rs = w.sin();
            pl.vib_depth = 1.0 + rng.bipolar() * 0.4 * (0.3 + vib_spread) * hum;
            pl.vib_delay = 0.12 + rng.next_f32() * 0.25;
            pl.vib.start(pl.vib_rate, 1.0, rng);
            // Bow width: ~10 mm of hair on the string, in samples of string.
            let taps = ((0.010 / (spec.c / sr)).round() as usize).clamp(1, 5) | 1;
            pl.bow_h = taps / 2;
            let mut ws = [0.0f32; 5];
            let mut sum = 0.0;
            for j in 0..taps {
                ws[j] = (PI * (j as f32 + 1.0) / (taps as f32 + 1.0)).sin().powi(2);
                sum += ws[j];
            }
            for w in ws.iter_mut() {
                *w /= sum;
            }
            pl.bow_w = ws;
            pl.bow_sw2 = ws.iter().map(|w| w * w).sum::<f32>().max(1e-6);
            pl.wander_a = Wander::new(sr / 16.0);
            pl.wander_p = Wander::new(sr / 16.0);
            pl.wander_a.reset(rng);
            pl.wander_p.reset(rng);
            pl.ctl_cents = 0.0;
            pl.ctl_cents_t = 0.0;
            pl.ctl_amp = 1.0;
            pl.speed_k = 1.0 + rng.bipolar() * 0.12 * hum;
            pl.force_k = 1.0 + rng.bipolar() * 0.12 * hum;
            pl.onset = if lead { 0 } else { (rng.next_f32() * (0.004 + 0.04 * tight) * sr) as u32 };
            let pan = (centre + if rep > 1 { rng.bipolar() * 0.18 * (0.3 + width) } else { 0.0 }).clamp(-1.0, 1.0);
            pl.pan_l = (1.0 - pan).sqrt();
            pl.pan_r = (1.0 + pan).sqrt();
            pl.gain = each * if lead { 1.0 } else { 0.85 + 0.3 * rng.next_f32() };

            // The string, tuned to its exact period (and the player's intonation).
            let (g, b) = design_loss(&spec, material, STOP_FRETLESS, sr, damp);
            let period = (base_period * 2f32.powf(-pl.cents / 1200.0)).min((TBUF / 2 - 8) as f32);
            tune(&mut pl.tl, period, g, b);
            // Torsion: faster and lossier (Q ≈ 30 per round trip).
            let pr = period / ratio;
            pl.torsion = torsion > 0.01 && pr >= 8.0 && bowed;
            if pl.torsion {
                tune(&mut pl.rl, pr.min((RBUF / 2 - 8) as f32), 0.9, 0.35);
                pl.kappa = ratio * 0.5 / torsion.max(0.05);
            }

            // Their own instrument: the low modes a few percent from the next player's.
            let mut gsum = 0.0;
            pl.nmodes = fd.modes.len().min(MAX_MODES);
            for (i, &(mf, q, mg)) in fd.modes.iter().take(MAX_MODES).enumerate() {
                let spread = if rep > 1 || k > 0 { 1.0 + rng.bipolar() * 0.035 } else { 1.0 };
                let mute_k = if mf > 500.0 { 1.0 - 0.25 * mute } else { 1.0 };
                // Wood is lossy: in-loop body modes at ~0.75 of the measured upper-bound Q.
                pl.modes[i] = Bp::new(mf * spread, q * 0.75, sr);
                pl.mode_g[i] = mg * mute_k * (1.0 + rng.bipolar() * 0.1 * (rep > 1) as u8 as f32);
                gsum += pl.mode_g[i];
            }
            let mut y0 = fd.y0 * body * (1.0 - 0.2 * mute);
            let kmax = 0.45 / (2.0 * spec.z0 * gsum.max(0.1));
            y0 = y0.min(kmax);
            pl.y0 = y0;

            // Sound point: fixed in metres from the bridge.
            pl.beta = (beta0 * (1.0 + rng.bipolar() * 0.08 * hum)).clamp(0.02, 0.3);
            let m_ex = (pl.beta * n_open).min(0.45 * n_stop).max(1.0);
            pl.m_t = m_ex.round() as usize;
            pl.beta = m_ex / n_stop;
            pl.m_r = ((pl.beta * pl.rl.period * 0.5).round() as usize).max(1);
            pl.touch_m = if harm_n > 1 { (n_stop / harm_n as f32).round().max(1.0) as usize } else { 0 };

            let (v_b, f_b) = bow_for(artic, mu_s, mu_d, pl, p, dyn_);
            pl.v_b = v_b;
            // Schelleng's window scales with the impedance the bow actually sees: with torsion
            // the string's surface is softer (Z_eff = Z_t·κ/(1+κ)), so the same force presses harder.
            pl.f_b = if pl.torsion { f_b * pl.kappa / (1.0 + pl.kappa) } else { f_b };
            pl.dir = 1.0;
            pl.bow_x = rng.next_f32() * 0.15 * bow_len;
            pl.change = 1.0;
            pl.trem_rate = 11.0 + 6.0 * rng.next_f32();
            pl.trem_phase = rng.next_f32();

            // Plucked and struck articulations excite once.
            let dx = spec.c / sr;
            match artic {
                A_PIZZ | A_SNAP => {
                    // The pizzicato finger near the end of the fingerboard (~25% of the open string).
                    let bp = (0.25 * n_open).min(0.45 * n_stop).max(1.0);
                    let force = (0.3 + 1.8 * v.powf(1.3)) * if artic == A_SNAP { 3.0 } else { 1.0 };
                    let beta = bp / n_stop;
                    let amp = (force * beta * (1.0 - beta) * spec.l_stop / spec.t).min(0.012 * spec.l_stop);
                    let sign = if rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
                    let w = (0.012 / dx).max(0.5);
                    pluck(&mut pl.tl, amp * sign, bp, w, sr);
                    pl.y_ex = if artic == A_SNAP { amp } else { 0.0 };
                }
                A_LEGNO => {
                    pl.ham_on = true;
                    pl.ham_y = -1.0e-4;
                    // A wooden stick, ~4 g of it moving, struck with the wrist.
                    pl.ham_v = (0.25 + 1.5 * v) * 0.6;
                }
                _ => {}
            }
        }
        // Radiated level of a nominal bowed note, so the family sits at similar levels.
        self.norm = fd.level * 0.18 / (fd.y0 * spec.t * 0.05).max(1e-9);
        self.t = 0;
    }

    /// Legato: the same bow, the finger moves (each player at their own moment).
    pub fn slur(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        if self.released || self.t == 0 || !self.is_bowed() || matches!(self.artic, A_SPICCATO | A_HARMONIC) {
            self.trigger(note_hz, velocity, p, rng);
            return;
        }
        let fd = &FIDDLES[self.inst];
        let set = pidx(p, AR_STRING_SET, STRING_SET_NAMES.len());
        let tension = 2f32.powf((p01(p, AR_TENSION) - 0.5) * 1.0);
        let (spec, _) = string_for(fd, self.inst, set, note_hz.clamp(20.0, self.sr * 0.3), p01(p, AR_STRING_PREF), tension);
        let base = self.sr / spec.f_loop;
        for k in 0..self.np {
            let pl = &mut self.players[k];
            pl.spec.f = spec.f;
            pl.tl.target = (base * 2f32.powf(-pl.cents / 1200.0)).min((TBUF / 2 - 8) as f32);
        }
        self.vel = velocity.clamp(0.0, 1.0);
    }

    pub fn release(&mut self) {
        self.released = true;
    }

    pub fn set_expression(&mut self, mod_wheel: f32) {
        self.expr = mod_wheel.clamp(0.0, 1.0);
    }

    #[inline]
    fn dashpot(l: &mut Loop, m: usize, zeta: f32) {
        let back = (l.period - m as f32).round().max(m as f32 + 1.0) as usize;
        let v = l.age(m) - l.age(back);
        let dv = -v * zeta / (1.0 + zeta);
        l.add(m, dv);
        l.add(back, -dv);
    }

    /// One stereo sample; also leaves this sample's deep-body force in `bus_out`.
    pub fn render_sample(&mut self, bend: f32, mod_wheel: f32, rng: &mut Rng) -> (f32, f32) {
        let sr = self.sr;
        let dt = 1.0 / sr;
        if !self.expr_init {
            self.expr = mod_wheel;
            self.expr_init = true;
        }
        self.expr += (mod_wheel - self.expr) * 0.002;
        self.bend += (bend - self.bend) * 0.01;
        let dyn_now = if self.mod_dyn { self.expr.max(0.02) } else { self.dyn_ };
        let dyn_at = self.dyn_;
        // The mod wheel moves speed and force together (force ∝ speed keeps the stroke at the
        // same place in Schelleng's window). Same for every player: computed once.
        let k_dyn = if self.mod_dyn { speed_curve(dyn_now) / speed_curve(dyn_at) } else { 1.0 };
        // Real string vibrato: ±15–30 cents, wider when playing out.
        let vib_depth_c = self.vib_amt * 40.0 * (0.5 + 0.7 * dyn_now);
        // How much a player's bow pressure / speed and intonation wander (sections a little more).
        let life_amp = 0.045;
        let life_pitch = 2.5;
        let vib_extra = if self.mod_dyn { 0.0 } else { self.expr };
        let vib_wheel = 25.0 * vib_extra;
        let release_damp = self.release_damp;
        let artic = self.artic;
        let bowed = self.is_bowed();
        let (mut ol, mut or) = (0.0f32, 0.0f32);
        let mut bus = 0.0f32;
        let mu_s = self.mu_s;
        let mu_d = self.mu_d;
        let soft = self.rosin_soft;
        let norm_d = sr / (TAU * 400.0);
        for k in 0..self.np {
            let pl = &mut self.players[k];
            if self.t < pl.onset {
                continue;
            }
            let pt = (self.t - pl.onset) as f32 * dt;
            // The player's life, at control rate: bow pressure and speed wander a few percent,
            // intonation wanders a few cents (the ear pulls it back), and the vibrato develops
            // into the note with its own rate and depth.
            if (self.t - pl.onset) % 16 == 0 {
                let wa = pl.wander_a.tick(rng);
                let wp = pl.wander_p.tick(rng);
                let (v, shape) = pl.vib.cents(pt, 16.0 * dt, wp);
                pl.ctl_cents_t = v * vib_depth_c * pl.vib_depth + vib_wheel * pl.vib_depth * shape + wp * life_pitch;
                pl.ctl_amp = 1.0 + wa * life_amp;
            }
            pl.ctl_cents += (pl.ctl_cents_t - pl.ctl_cents) * 0.0625;
            // 2^(c/1200) to second order (≤ 0.1 cent error inside ±60 cents).
            let y = pl.ctl_cents * (std::f32::consts::LN_2 / 1200.0);
            let pitch = self.bend * (1.0 + y + 0.5 * y * y);
            {
                let l = &mut pl.tl;
                l.period += (l.target - l.period) * self.glide;
                l.read = (l.period / pitch - 1.0 - l.pd).clamp(1.0, (TBUF - 8) as f32);
            }
            if pl.torsion {
                let l = &mut pl.rl;
                l.read = (l.period / pitch - 1.0 - l.pd).clamp(1.0, (RBUF - 8) as f32);
            }

            // 1. Bridge force → body → bridge velocity.
            let xin = pl.tl.read_at(pl.tl.read);
            let fb = -2.0 * pl.spec.z0 * xin;
            let mut vsum = 0.0;
            for i in 0..pl.nmodes {
                vsum += pl.modes[i].tick(fb) * pl.mode_g[i];
            }
            let vb = pl.y0 * vsum;
            let y = pl.tl.filter(xin) + vb;
            pl.tl.write(y);
            if pl.torsion {
                let xr = pl.rl.read_at(pl.rl.read);
                let yr = pl.rl.filter(xr);
                pl.rl.write(yr);
            }

            // 2. The bow.
            let n_half = (pl.tl.period * 0.5) as usize;
            let m_t = pl.m_t.min(n_half.saturating_sub(1)).max(1);
            if bowed {
                // Envelope: how the bow meets and leaves the string.
                let target = if self.released { 0.0 } else { 1.0 };
                let (up, dn) = match artic {
                    A_DETACHE | A_MARCATO => (1.0 / (sr * 0.006), self.release_rate * 2.0),
                    _ => (1.0 / (sr * 0.018), self.release_rate),
                };
                pl.env += (target - pl.env).clamp(-dn, up);
                let (v_tgt, f_tgt) = (pl.v_b * k_dyn * (1.0 + 0.5 * (pl.ctl_amp - 1.0)), pl.f_b * k_dyn * pl.ctl_amp);
                let mut vb_bow = v_tgt * pl.dir;
                let mut fnorm = f_tgt * pl.env;
                match artic {
                    A_SPICCATO => {
                        // The bow drops onto the string and bounces off: a short, round force pulse.
                        let dur = 0.05 + 0.05 * (1.0 - self.vel);
                        let x = pt / dur;
                        let shape = if x < 1.0 { (PI * x).sin() } else { 0.0 };
                        fnorm = f_tgt * 1.4 * shape;
                        vb_bow = v_tgt * 1.6 * pl.dir;
                    }
                    A_TREMOLO => {
                        pl.trem_phase += pl.trem_rate * dt;
                        if pl.trem_phase >= 1.0 {
                            pl.trem_phase -= 1.0;
                        }
                        vb_bow = v_tgt * 1.7 * (TAU * pl.trem_phase).sin();
                    }
                    A_MARCATO => {
                        fnorm *= 1.0 + 1.5 * (-pt / 0.12).exp();
                    }
                    _ => {}
                }
                // Players dig in at the start of a stroke so the Helmholtz motion catches at once.
                if !matches!(artic, A_SPICCATO | A_TREMOLO) {
                    let dig = if artic == A_DETACHE { 0.8 } else { 0.5 };
                    fnorm *= 1.0 + dig * (-pt / 0.05).exp();
                }
                // Bow changes: the bow is a real length.
                if self.bow_len > 0.05 && !matches!(artic, A_TREMOLO | A_SPICCATO) {
                    pl.bow_x += v_tgt * dt;
                    if pl.bow_x > self.bow_len && pl.change >= 1.0 {
                        pl.change = 0.0;
                        pl.bow_x = 0.0;
                    }
                    if pl.change < 1.0 {
                        pl.change += dt / 0.07;
                        let c = pl.change.min(1.0);
                        // Speed through zero and back, and a dip in force.
                        let s = (PI * c).cos();
                        vb_bow = v_tgt * pl.dir * s;
                        fnorm *= 0.7 + 0.3 * (2.0 * c - 1.0).abs();
                        if c >= 0.5 && s < 0.0 {
                            pl.dir = -pl.dir;
                            vb_bow = -vb_bow;
                        }
                        if pl.change >= 1.0 {
                            vb_bow = v_tgt * pl.dir;
                        }
                    }
                }
                // Hair: a little grain in the pressure (the rosin's grain is in the slip, below).
                pl.noise_lp += (rng.bipolar() - pl.noise_lp) * 0.2;
                fnorm *= 1.0 + 0.015 * pl.noise_lp;
                if fnorm > 1e-6 {
                    let z_t = pl.spec.z0;
                    let (z_eff, share_t) = if pl.torsion { (z_t * pl.kappa / (1.0 + pl.kappa), pl.kappa / (1.0 + pl.kappa)) } else { (z_t, 1.0) };
                    // The bow is a ribbon of hair ~10 mm wide: its force spreads over a few samples of
                    // string (Hann weights), which rounds the Helmholtz corner as a real bow does —
                    // a one-point bow gives a glassy, metallic edge. The friction acts on the
                    // weighted mean velocity, which sees the impedance Z/Σw².
                    let k = fnorm * pl.bow_sw2 / (2.0 * z_eff);
                    // The returning wave at the bow sits at the loop's true round trip minus m —
                    // fractional, so a gliding finger or vibrato moves it smoothly instead of in
                    // whole-sample jumps (each jump was a velocity step that broke the stick-slip).
                    let hw = pl.bow_h.min(m_t.saturating_sub(1));
                    let mut vh = 0.0;
                    for j in 0..=2 * hw {
                        let m = m_t + j - hw;
                        vh += pl.bow_w[j + pl.bow_h - hw] * back_vel(&pl.tl, m);
                    }
                    let (vr, ra, rb) = if pl.torsion {
                        let nr = (pl.rl.period * 0.5) as usize;
                        let m = pl.m_r.min(nr.saturating_sub(1)).max(1);
                        (back_vel(&pl.rl, m), m, back_pos(&pl.rl, m))
                    } else {
                        (0.0, 0, 0.0)
                    };
                    let v_in = vh + vr;
                    let rel = v_in - vb_bow;
                    // Thermal friction: heat softens the static grip.
                    let ms = mu_s - (mu_s - mu_d) * soft * pl.theta.min(1.0);
                    let v = if rel.abs() <= ms * k {
                        vb_bow
                    } else {
                        let sgn = rel.signum();
                        let aa = rel.abs();
                        let v0 = 0.1;
                        // Rosin grain: while the hair slips, the friction fluctuates.
                        let md = mu_d * (1.0 + 0.3 * rng.bipolar());
                        let bq = v0 - aa + k * md;
                        let cq = v0 * (k * ms - aa);
                        let x = (-bq + (bq * bq - 4.0 * cq).max(0.0).sqrt()) * 0.5;
                        vb_bow + sgn * x.max(0.0)
                    };
                    let dv = v - v_in;
                    let slip = (v - vb_bow).abs();
                    // Heat from slipping, cooling back toward ambient in a few ms.
                    pl.theta += (slip / v_tgt.max(0.02) * 0.5 - pl.theta) * (dt / 0.003);
                    for j in 0..=2 * hw {
                        let m = m_t + j - hw;
                        let wj = pl.bow_w[j + pl.bow_h - hw] / pl.bow_sw2;
                        let bt = back_pos(&pl.tl, m);
                        kick_frac(&mut pl.tl, m, bt, dv * share_t * wj);
                    }
                    if pl.torsion {
                        kick_frac(&mut pl.rl, ra, rb, dv * (1.0 - share_t));
                    }
                }
                // Harmonics: the finger rests on the node.
                if pl.touch_m > 0 && !self.released {
                    let m = pl.touch_m.min(n_half.saturating_sub(1)).max(1);
                    Self::dashpot(&mut pl.tl, m, 1.0);
                }
            } else if pl.ham_on {
                // Col legno: a light wooden stick bouncing off the string (Hertz contact).
                let z = pl.spec.z0;
                let back = (pl.tl.period - m_t as f32).round().max(m_t as f32 + 1.0) as usize;
                let vin = pl.tl.age(m_t) - pl.tl.age(back);
                let (mass, kk, pe) = (0.004, 4.0e8, 1.5);
                let subs = 6;
                let dts = dt / subs as f32;
                let mut ys = pl.y_ex;
                let mut favg = 0.0;
                for _ in 0..subs {
                    let delta = pl.ham_y - ys;
                    let fh = if delta > 0.0 { kk * delta.powf(pe) } else { 0.0 };
                    ys += (vin + fh / (2.0 * z)) * dts;
                    pl.ham_v -= fh / mass * dts;
                    pl.ham_y += pl.ham_v * dts;
                    favg += fh;
                }
                favg /= subs as f32;
                let dv = favg / (2.0 * z);
                pl.tl.add(m_t, dv);
                pl.tl.add(back, -dv);
                pl.y_ex += (vin + dv) * dt;
                if (pl.ham_v < 0.0 && pl.ham_y < pl.y_ex - 2.0e-4) || pt > 0.03 {
                    pl.ham_on = false;
                }
            } else if artic == A_SNAP && pl.y_ex > 0.0 && pt > 0.002 && pt < 0.006 {
                // Bartók pizz: the string slaps the fingerboard on its way back.
                let back = (pl.tl.period - m_t as f32).round().max(m_t as f32 + 1.0) as usize;
                let v = pl.tl.age(m_t) - pl.tl.age(back);
                if v < 0.0 {
                    let dv = -v * 0.8;
                    pl.tl.add(m_t, dv);
                    pl.tl.add(back, -dv);
                }
            }
            // After the note: the hand stops a pluck; once the bow has left, the stopping finger
            // eases off and the string rings out over a few hundred ms (longer with RELEASE).
            if self.released && (!bowed || pl.env < 0.05) {
                let m = ((n_half as f32) * 0.8).max(1.0) as usize;
                let z = if bowed { release_damp } else { 0.02 };
                Self::dashpot(&mut pl.tl, m.min(n_half.saturating_sub(1)).max(1), z);
            }

            // 3. Radiation: low modes here, the bridge force to the deep body.
            let pr = vsum;
            let yv = (pr - pl.p_prev) * norm_d * pl.y0 * pl.gain;
            pl.p_prev = pr;
            ol += yv * pl.pan_l;
            or += yv * pl.pan_r;
            bus += fb * pl.gain;
        }
        let ol = ol * self.norm;
        let or = or * self.norm;
        self.bus_out = bus * self.norm;
        let a = ol.abs().max(or.abs());
        self.level = if a > self.level { a } else { self.level * 0.9995 };
        self.t = self.t.wrapping_add(1);
        if !ol.is_finite() || !or.is_finite() || !self.bus_out.is_finite() {
            self.reset();
            self.bus_out = 0.0;
            return (0.0, 0.0);
        }
        (ol.clamp(-4.0, 4.0), or.clamp(-4.0, 4.0))
    }
}

// ── ensembles: who plays which note ─────────────────────────────────────────────────────────────

/// Sections of an ensemble, high to low: (instrument, seating section, players).
pub fn ensemble_sections(ens: usize, bass_octave: bool) -> ([(usize, usize, usize); 5], usize) {
    let mut s = [(0usize, 0usize, 1usize); 5];
    let n = match ens {
        1 => {
            s[..4].copy_from_slice(&[(0, 0, 1), (0, 1, 1), (1, 2, 1), (2, 3, 1)]);
            4
        }
        2 => {
            s.copy_from_slice(&[(0, 0, 1), (0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1)]);
            5
        }
        3 | 4 => {
            let sizes = if ens == 3 { CHAMBER } else { FULL };
            for i in 0..5 {
                s[i] = (SECTION_INST[i], i, sizes[i]);
            }
            5
        }
        _ => 1,
    };
    let _ = bass_octave;
    (s, n)
}

/// An instrument's comfortable range and lowest note (MIDI), for ensembles.
pub fn section_range(inst: usize) -> (f32, f32, f32) {
    let fd = &FIDDLES[inst.min(NUM_INSTRUMENTS - 1)];
    (fd.range.0, fd.range.1, fd.opens[0])
}

/// Assign notes (sorted high → low) to an ensemble's sections, keeping order (a higher note never
/// goes to a lower section) and preferring each section's comfortable range. Returns, per note,
/// the section index; several notes on one section are divisi.
pub fn assign_sections(notes_desc: &[f32], ens: usize, out: &mut [usize]) {
    let (secs, ns) = ensemble_sections(ens, false);
    let n = notes_desc.len().min(out.len());
    if ns <= 1 || n == 0 {
        for o in out.iter_mut().take(n) {
            *o = 0;
        }
        return;
    }
    // Range cost of note on section.
    let cost = |note: f32, s: usize| -> f32 {
        let (lo, hi) = FIDDLES[secs[s].0].range;
        let lowest = FIDDLES[secs[s].0].opens[0];
        if note < lowest - 0.01 {
            return 1.0e6; // unplayable
        }
        let d = if note < lo { lo - note } else if note > hi { note - hi } else { 0.0 };
        d * d
    };
    // DP over (note i, section s), non-decreasing section index as notes descend.
    const INF: f32 = 1.0e12;
    let mut dp = [[INF; 5]; 32];
    let mut from = [[0usize; 5]; 32];
    let n = n.min(32);
    for s in 0..ns {
        dp[0][s] = cost(notes_desc[0], s);
    }
    for i in 1..n {
        for s in 0..ns {
            let c = cost(notes_desc[i], s);
            let mut best = (INF, 0);
            for t in 0..=s {
                // Doubling up a section is allowed (divisi) but costs a little, so notes spread out.
                let share = if t == s { 2.0 } else { 0.0 };
                let v = dp[i - 1][t] + share;
                if v < best.0 {
                    best = (v, t);
                }
            }
            dp[i][s] = best.0 + c;
            from[i][s] = best.1;
        }
    }
    let mut s = (0..ns).min_by(|&a, &b| dp[n - 1][a].partial_cmp(&dp[n - 1][b]).unwrap()).unwrap();
    for i in (0..n).rev() {
        out[i] = s;
        s = from[i][s];
    }
}

/// The role for section `s` of ensemble `ens`, sharing its players among `divisi` notes.
pub fn role_for(ens: usize, s: usize, divisi: usize, single_inst: usize, single_size: usize) -> Role {
    if ens == 0 {
        let players = (single_size / divisi.max(1)).max(1);
        return Role { inst: single_inst.min(NUM_INSTRUMENTS - 1), section: match single_inst { 0 => 0, 1 => 2, 2 => 3, _ => 4 }, players, bus: 0 };
    }
    let (secs, ns) = ensemble_sections(ens, false);
    let (inst, section, size) = secs[s.min(ns - 1)];
    Role { inst, section, players: (size / divisi.max(1)).max(1), bus: inst }
}

// ── the deep body rack ──────────────────────────────────────────────────────────────────────────

pub const NBUS: usize = 4;
const IR_LEN: usize = 8192;

/// Dense upper body modes of the family, by convolution on the summed bridge forces. In a single
/// instrument patch bus 0 and 1 are two different instruments (desk partners); in an ensemble each
/// instrument of the family has its own bus.
pub struct ArcoRack {
    conv: Vec<BodyConv>,
    key: u32,
    delay: Vec<[f32; 2 * crate::bodyconv::B]>,
    dpos: usize,
    ir_l: Vec<f32>,
    ir_r: Vec<f32>,
    pub bus: [[f32; crate::engine::MAX_BLOCK]; NBUS],
    pan: [(f32, f32); NBUS],
}

impl ArcoRack {
    pub fn new() -> Self {
        ArcoRack {
            conv: (0..NBUS).map(|_| BodyConv::new()).collect(),
            key: u32::MAX,
            delay: vec![[0.0; 2 * crate::bodyconv::B]; crate::spatial::MAX_CHANNELS],
            dpos: 0,
            ir_l: vec![0.0; IR_LEN],
            ir_r: vec![0.0; IR_LEN],
            bus: [[0.0; crate::engine::MAX_BLOCK]; NBUS],
            pan: [(1.0, 1.0); NBUS],
        }
    }

    pub fn active(p: &Params) -> bool {
        p.get(ARCO_BASE + AR_ENABLE) > 0.5
    }

    pub fn clear_bus(&mut self, frames: usize) {
        for b in self.bus.iter_mut() {
            b[..frames].iter_mut().for_each(|x| *x = 0.0);
        }
    }

    fn rebuild(&mut self, p: &Params, sr: f32) {
        let ens = pidx(p, AR_ENSEMBLE, ENSEMBLE_NAMES.len());
        let inst = pidx(p, AR_INSTRUMENT, NUM_INSTRUMENTS);
        let mute = p01(p, AR_MUTE);
        let body = 4f32.powf(p01(p, AR_BODY) - 0.5);
        for b in 0..NBUS {
            let fi = if ens == 0 { inst } else { b };
            let fd = &FIDDLES[fi];
            // A mute's mass on the bridge pulls the bridge hill down and flattens it.
            let mut peaks = [(0.0f32, 0.0f32, 0.3f32); 2];
            for (i, &(f, g, w)) in fd.peaks.iter().take(2).enumerate() {
                peaks[i] = (f * (1.0 - 0.3 * mute), g * (1.0 - 0.6 * mute), w);
            }
            let cloud = ModeCloud {
                f_lo: fd.cross,
                f_hi: 14000.0,
                density: fd.density,
                density_exp: 0.6,
                eta: fd.eta * 1.35,
                eta_slope: 0.25,
                floor: fd.floor * (1.0 - 0.35 * mute),
                peaks: &peaks,
                tilt_db: -6.0 - 3.0 * mute,
                seed: 0xA2C0 + (fi as u32) * 977 + (b as u32) * 131,
            };
            render_cloud(&cloud, sr, fd.y0 * body, &mut self.ir_l, &mut self.ir_r);
            let (l, r) = (&self.ir_l[..], &self.ir_r[..]);
            self.conv[b].set_ir(l, r);
            self.conv[b].reset();
            let pan: f32 = if ens == 0 { if b == 0 { -0.25 } else { 0.25 } } else { [-0.5, 0.25, 0.5, 0.75][b] };
            self.pan[b] = ((1.0 - pan).sqrt(), (1.0 + pan).sqrt());
        }
    }

    /// After the voices: delay their low-mode radiation by the convolver's latency and add the deep body.
    pub fn process(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params, sr: f32) {
        let key = (pidx(p, AR_ENSEMBLE, 5) as u32) | ((pidx(p, AR_INSTRUMENT, 4) as u32) << 4) | (((p01(p, AR_MUTE) * 16.0) as u32) << 8) | (((p01(p, AR_BODY) * 16.0) as u32) << 16) | ((sr as u32) << 1 & 0xFF00_0000);
        if key != self.key {
            self.rebuild(p, sr);
            self.key = key;
        }
        let deep = p01(p, AR_DEEP) * 2.0;
        let lat = crate::bodyconv::B;
        let nch = nch.min(crate::spatial::MAX_CHANNELS);
        for f in 0..frames {
            let (mut dl, mut dr) = (0.0f32, 0.0f32);
            for b in 0..NBUS {
                let x = self.bus[b][f];
                if self.conv[b].active {
                    let (l, r) = self.conv[b].tick(x);
                    dl += l * self.pan[b].0;
                    dr += r * self.pan[b].1;
                }
            }
            let i = self.dpos;
            let j = (self.dpos + 2 * lat - lat) % (2 * lat);
            for c in 0..nch {
                let x = out[c][f];
                self.delay[c][i] = x;
                let delayed = self.delay[c][j];
                let add = match c {
                    0 => dl,
                    1 => dr,
                    _ => 0.5 * (dl + dr),
                };
                out[c][f] = delayed + add * deep;
            }
            self.dpos = (self.dpos + 1) % (2 * lat);
        }
    }
}

impl Default for ArcoRack {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SR: f32 = 48000.0;

    pub(crate) fn params(inst: usize, artic: usize) -> Params {
        let mut p = Params::new();
        p.set(ARCO_BASE + AR_ENABLE, 1.0);
        p.set(ARCO_BASE + AR_INSTRUMENT, inst as f32);
        p.set(ARCO_BASE + AR_ARTIC, artic as f32);
        p
    }

    fn render_role(p: &Params, role: Role, midi: f32, secs: f32, hold: f32) -> (Vec<f32>, Vec<f32>) {
        let mut v = ArcoVoice::new(SR);
        let mut rng = Rng(4242);
        v.role = role;
        v.trigger(midi_to_hz(midi), 0.8, p, &mut rng);
        let n = (secs * SR) as usize;
        let (mut out, mut bus) = (Vec::with_capacity(n), Vec::with_capacity(n));
        for i in 0..n {
            if i == (hold * SR) as usize {
                v.release();
            }
            let (l, r) = v.render_sample(1.0, 0.0, &mut rng);
            out.push(0.5 * (l + r));
            bus.push(v.bus_out);
        }
        (out, bus)
    }

    fn render(p: &Params, inst: usize, midi: f32, secs: f32, hold: f32) -> Vec<f32> {
        render_role(p, Role { inst, section: 0, players: 1, bus: 0 }, midi, secs, hold).0
    }

    fn pitch(x: &[f32], expect: f32) -> f32 {
        let n = x.len();
        let mag = |f: f32| -> f32 {
            let w = TAU * f / SR;
            let (mut re, mut im) = (0.0f64, 0.0f64);
            for (i, &v) in x.iter().enumerate() {
                let h = 0.5 - 0.5 * (TAU * i as f32 / n as f32).cos();
                let ph = w * i as f32;
                re += (v * h * ph.cos()) as f64;
                im += (v * h * ph.sin()) as f64;
            }
            (re * re + im * im).sqrt() as f32
        };
        let mut best = (expect, -1.0f32);
        let mut c = -80.0f32;
        while c <= 80.0 {
            let f = expect * 2f32.powf(c / 1200.0);
            let m = mag(f);
            if m > best.1 {
                best = (f, m);
            }
            c += 1.0;
        }
        best.0
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    fn quiet(mut p: Params) -> Params {
        p.set(ARCO_BASE + AR_VIB_DEPTH, 0.0);
        p.set(ARCO_BASE + AR_INTONATION, 0.0);
        p
    }

    #[test]
    fn arco_every_instrument_speaks_in_tune() {
        for inst in 0..NUM_INSTRUMENTS {
            let fd = &FIDDLES[inst];
            for &n in &[fd.opens[0] + 5.0, fd.opens[2] + 7.0] {
                let p = quiet(params(inst, A_SUSTAIN));
                let x = render(&p, inst, n, 1.2, 1.2);
                assert!(x.iter().all(|v| v.is_finite()), "{} {} non-finite", INSTRUMENT_NAMES[inst], n);
                let r = rms(&x[(0.4 * SR) as usize..(1.1 * SR) as usize]);
                assert!(r > 1e-3, "{} {} silent ({})", INSTRUMENT_NAMES[inst], n, r);
                let f = pitch(&x[(0.4 * SR) as usize..(1.1 * SR) as usize], midi_to_hz(n));
                let cents = 1200.0 * (f / midi_to_hz(n)).log2();
                assert!(cents.abs() < 15.0, "{} note {} off by {:.1} cents", INSTRUMENT_NAMES[inst], n, cents);
            }
        }
    }

    #[test]
    fn arco_bow_sustains_then_dies_after_release() {
        let p = quiet(params(0, A_SUSTAIN));
        let x = render(&p, 0, 69.0, 2.5, 1.5);
        let held = rms(&x[(1.0 * SR) as usize..(1.4 * SR) as usize]);
        let early = rms(&x[(0.3 * SR) as usize..(0.7 * SR) as usize]);
        let after = rms(&x[(2.2 * SR) as usize..(2.5 * SR) as usize]);
        assert!(held > early * 0.5, "bow should sustain: {} vs {}", held, early);
        assert!(after < held * 0.3, "should decay after the bow leaves: {} vs {}", after, held);
    }

    #[test]
    fn arco_torsion_changes_the_tone_but_stays_in_tune() {
        let mut p = quiet(params(2, A_SUSTAIN));
        p.set(ARCO_BASE + AR_TORSION, 0.0);
        let a = render(&p, 2, 50.0, 1.0, 1.0);
        p.set(ARCO_BASE + AR_TORSION, 0.5);
        let b = render(&p, 2, 50.0, 1.0, 1.0);
        let diff: f32 = a.iter().zip(&b).map(|(x, y)| (x - y).abs()).sum();
        assert!(diff > 1e-2, "torsion had no effect");
        let f = pitch(&b[(0.4 * SR) as usize..], midi_to_hz(50.0));
        assert!((1200.0 * (f / midi_to_hz(50.0)).log2()).abs() < 15.0);
    }

    #[test]
    fn arco_articulations_are_finite_and_audible() {
        for a in 0..ARTIC_NAMES.len() {
            for inst in 0..NUM_INSTRUMENTS {
                let p = params(inst, a);
                let n = FIDDLES[inst].opens[1] + 4.0;
                let x = render(&p, inst, n, 1.0, 0.6);
                assert!(x.iter().all(|v| v.is_finite()), "{} {} non-finite", ARTIC_NAMES[a], INSTRUMENT_NAMES[inst]);
                let peak = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
                assert!(peak < 3.9, "{} {} peak {}", ARTIC_NAMES[a], INSTRUMENT_NAMES[inst], peak);
                assert!(rms(&x[..(0.5 * SR) as usize]) > 3e-4, "{} {} silent", ARTIC_NAMES[a], INSTRUMENT_NAMES[inst]);
            }
        }
    }

    #[test]
    fn arco_pizzicato_decays_and_spiccato_is_short() {
        let p = params(0, A_PIZZ);
        let x = render(&p, 0, 69.0, 1.5, 1.5);
        assert!(rms(&x[(1.2 * SR) as usize..]) < rms(&x[..(0.2 * SR) as usize]) * 0.3);
        let p = params(0, A_SPICCATO);
        let x = render(&p, 0, 69.0, 0.8, 0.8);
        assert!(rms(&x[(0.5 * SR) as usize..]) < rms(&x[..(0.12 * SR) as usize]) * 0.35);
    }

    #[test]
    fn arco_section_is_wider_and_detuned_not_identical() {
        let p = params(0, A_SUSTAIN);
        let (solo, _) = render_role(&p, Role { inst: 0, section: 0, players: 1, bus: 0 }, 67.0, 1.2, 1.2);
        let (sec, bus) = render_role(&p, Role { inst: 0, section: 0, players: 12, bus: 0 }, 67.0, 1.2, 1.2);
        assert!(sec.iter().all(|v| v.is_finite()) && bus.iter().all(|v| v.is_finite()));
        let rs = rms(&solo[(0.4 * SR) as usize..]);
        let rt = rms(&sec[(0.4 * SR) as usize..]);
        // A section of 12 sits louder than a soloist but well under 12×.
        assert!(rt > rs * 0.9 && rt < rs * 4.0, "solo {} section {}", rs, rt);
        assert!(rms(&bus) > 0.0);
    }

    #[test]
    fn arco_ensemble_assignment_keeps_order_and_ranges() {
        let mut out = [0usize; 4];
        // A four-note chord, quartet: one note each, top to bottom.
        assign_sections(&[79.0, 72.0, 64.0, 48.0], 1, &mut out);
        assert_eq!(out, [0, 1, 2, 3]);
        // A low note can't go to a violin.
        let mut o1 = [0usize; 1];
        assign_sections(&[40.0], 2, &mut o1);
        assert!(o1[0] >= 3, "E2 went to section {}", o1[0]);
        // Full orchestra, two notes: they go to fitting sections in order.
        let mut o2 = [0usize; 2];
        assign_sections(&[84.0, 36.0], 4, &mut o2);
        assert!(o2[0] <= 1 && o2[1] >= 3, "{:?}", o2);
    }

    #[test]
    fn arco_rack_deep_body_adds_upper_band() {
        let mut p = params(0, A_SUSTAIN);
        p.set(ARCO_BASE + AR_DEEP, 0.5);
        let mut rack = ArcoRack::new();
        let (_, bus) = render_role(&p, Role::default(), 69.0, 0.5, 0.5);
        let mut out = Box::new([[0.0f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS]);
        let mut e = 0.0;
        for blk in bus.chunks(256) {
            rack.clear_bus(blk.len());
            rack.bus[0][..blk.len()].copy_from_slice(blk);
            for c in 0..2 {
                out[c][..blk.len()].iter_mut().for_each(|x| *x = 0.0);
            }
            rack.process(&mut out, blk.len(), 2, &p, SR);
            e += out[0][..blk.len()].iter().map(|v| v * v).sum::<f32>();
            assert!(out[0][..blk.len()].iter().all(|v| v.is_finite()));
        }
        assert!(e > 0.0, "deep body silent");
    }

    #[test]
    fn arco_engine_plays_a_quartet_chord() {
        let mut e = crate::engine::Engine::new(SR);
        e.set_param(ARCO_BASE + AR_ENABLE, 1.0);
        e.set_param(ARCO_BASE + AR_ENSEMBLE, 1.0);
        e.set_param(ARCO_BASE + AR_DEEP, 0.5);
        for (i, n) in [79.0f32, 72.0, 64.0, 48.0].iter().enumerate() {
            e.note_on(*n, 0.8, i as u32 + 1, 0);
        }
        let mut energy = 0.0f32;
        for _ in 0..(SR as usize / 128) {
            e.render(128);
            let x = unsafe { std::slice::from_raw_parts(e.scratch_ptr(0), 128) };
            assert!(x.iter().all(|v| v.is_finite()));
            energy += x.iter().map(|v| v * v).sum::<f32>();
        }
        assert!(energy > 1e-3, "quartet silent: {}", energy);
        assert_eq!(e.active_voices(), 4);
        for i in 0..4 {
            e.note_off(i + 1);
        }
        for _ in 0..(5.0 * SR) as usize / 128 {
            e.render(128);
        }
        assert_eq!(e.active_voices(), 0, "voices should free after release");
    }

    /// `cargo test --release arco_diag -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn arco_diag() {
        for inst in 0..NUM_INSTRUMENTS {
            let fd = &FIDDLES[inst];
            let mut line = format!("{:12}", INSTRUMENT_NAMES[inst]);
            for &n in &[fd.opens[0] + 2.0, fd.opens[1] + 5.0, fd.opens[3] + 7.0, fd.opens[3] + 19.0] {
                let p = quiet(params(inst, A_SUSTAIN));
                let x = render(&p, inst, n, 1.2, 1.2);
                let f = pitch(&x[(0.4 * SR) as usize..(1.1 * SR) as usize], midi_to_hz(n));
                let (_, bus) = render_role(&p, Role { inst, ..Role::default() }, n, 1.2, 1.2);
                line += &format!(" | {:>3} {:+5.1}c rms {:.4} bus {:.3}", n, 1200.0 * (f / midi_to_hz(n)).log2(), rms(&x[(0.4 * SR) as usize..]), rms(&bus));
            }
            println!("{}", line);
        }
        let t0 = std::time::Instant::now();
        let p = params(0, A_SUSTAIN);
        let _ = render_role(&p, Role { inst: 0, section: 0, players: 16, bus: 0 }, 67.0, 2.0, 2.0);
        println!("8 simulated violinists: {:.2}% of a core", t0.elapsed().as_secs_f64() / 2.0 * 100.0);
    }
}
#[cfg(test)]
mod probe {
    use super::*;
    use super::tests::params;
    #[test]
    #[ignore]
    fn arco_slur_dump() {
        let sr = 48000.0;
        let mut p = params(0, 0);
        p.set(ARCO_BASE + AR_VIB_DEPTH, 0.0);
        let mut v = ArcoVoice::new(sr);
        let mut rng = Rng(4242);
        v.trigger(midi_to_hz(69.0), 0.75, &p, &mut rng);
        let mut out: Vec<u8> = Vec::new();
        for i in 0..(1.2 * sr) as usize {
            if i == (0.6 * sr) as usize { v.slur(midi_to_hz(71.0), 0.75, &p, &mut rng); }
            let (l, r) = v.render_sample(1.0, 0.0, &mut rng);
            out.extend_from_slice(&(0.5 * (l + r)).to_le_bytes());
            out.extend_from_slice(&v.bus_out.to_le_bytes());
        }
        std::fs::write(std::env::var("DUMP").unwrap(), out).unwrap();
    }
}
