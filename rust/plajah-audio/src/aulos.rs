//! AULOS — the woodwinds as reeds and jets on air columns: flutes, oboes, clarinets, bassoons,
//! saxophones and recorder, solo or as the orchestra's woodwind section.
//!
//! Reeds. A cane reed is a valve the mouth pressure pushes shut: a stiff, light, damped
//! oscillator (single reed on a mouthpiece lay, or two blades of a double reed) whose opening
//! lets through Bernoulli flow, solved implicitly against the bore's input each sample as in
//! CORNU. It can beat against the lay. Its playing state is set the way the acoustics literature
//! describes it (Kergomard, Dalmont): γ = p_mouth / p_M, the blowing pressure over the pressure
//! that closes the reed (threshold ≈ ⅓, beating past ½), and ζ, the embouchure's opening against
//! the bore's impedance — dynamics are γ and the player's lip, not a volume knob.
//!
//! Jets. A flute's air leaves the lips as a jet that crosses the embouchure hole and splits on
//! the far edge. The acoustic flow in the hole deflects the jet where it leaves the lips; the
//! deflection travels with the jet (at ~0.6 of its speed) and grows; at the edge the jet's
//! position decides how much of it goes into the tube (tanh profile, after Verge and Fabre). The
//! tube is driven by the rate of change of that flow (the jet-drive pressure). Flautists keep the
//! jet's travel time near half a period by moving the lips as they blow harder or overblow — so
//! does the model's player. Breath turbulence rides on the jet: it's half of what a flute is.
//!
//! The air column. A clarinet is a cylinder closed by the reed: its loop has the open end's sign
//! inversion and resonates at odd harmonics (the twelfth when it overblows). Oboe, bassoon and
//! saxophone are cones and a flute is a cylinder open at both ends: complete harmonic series. The
//! tone holes below the last closed one form a lattice that reflects the lows and lets the highs
//! out above its cutoff frequency (Benade) — the reason each woodwind has the colour it has. That
//! cutoff is the open-end reflection filter; what leaks through is what radiates.
//!
//! The player listens, as in CORNU: an intonation loop (embouchure / rolling the flute) and
//! finding the register when a note cracks. Key clicks, breath, vibrato (flute, oboe, sax),
//! flutter-tongue and growl; sections deal chords across the woodwind choir.

use crate::osc::Rng;
use crate::params::*;
use crate::tonos::{onepole_pd, Loop};
use std::f32::consts::PI;

const TAU: f32 = 2.0 * PI;
const RHO: f32 = 1.2;
const C_AIR: f32 = 343.0;

pub const NUM_INSTRUMENTS: usize = 15;
pub const INSTRUMENT_NAMES: [&str; NUM_INSTRUMENTS] = [
    "Flute", "Piccolo", "Alto flute", "Oboe", "Cor anglais", "Clarinet in B♭", "Bass clarinet", "Bassoon", "Contrabassoon",
    "Soprano saxophone", "Alto saxophone", "Tenor saxophone", "Baritone saxophone", "Alto recorder", "E♭ clarinet",
];
pub const ARTIC_NAMES: [&str; 7] = ["Sustain", "Legato", "Staccato", "Accent", "Flutter-tongue", "Growl", "Breath attack"];
pub const SECTION_SIZES: [usize; 4] = [1, 2, 3, 4];
pub const ENSEMBLE_NAMES: [&str; 6] = ["One instrument", "Woodwind quartet", "Flute choir", "Clarinet choir", "Full orchestral woodwinds", "Saxophone section"];

const ART_LEGATO: usize = 1;
const ART_STACCATO: usize = 2;
const ART_ACCENT: usize = 3;
const ART_FLUTTER: usize = 4;
const ART_GROWL: usize = 5;
const ART_BREATH: usize = 6;

const EX_REED: u8 = 0; // single reed (clarinet, sax)
const EX_DOUBLE: u8 = 1; // double reed (oboe, bassoon)
const EX_JET: u8 = 2; // flute: free jet across an embouchure hole
const EX_DUCT: u8 = 3; // recorder: a duct fixes the jet

const BORE_CYL: u8 = 0; // closed–open cylinder: odd harmonics
const BORE_OPEN: u8 = 1; // open–open cylinder (flutes): all harmonics
const BORE_CONE: u8 = 2; // truncated cone (oboe, bassoon, saxophone): all harmonics

pub const MAX_PLAYERS: usize = 4;
const BUF: usize = 4096;

struct Wind {
    ex: u8,
    bore: u8,
    bore_r: f32,
    lattice: f32, // tone-hole lattice cutoff (Hz)
    // reed: closing pressure (Pa), reed resonance (Hz), damping, rest opening (m), width (m)
    p_close: f32,
    reed_f: f32,
    reed_q: f32,
    h0: f32,
    width: f32,
    // jet: lip-to-edge distance at mf (m), labium offset (fraction of jet width)
    jet_w: f32,
    offset: f32,
    breath: f32, // turbulence
    vibrato: f32, // natural vibrato depth used by players of this instrument (0..1)
    apex: f32,    // cones: length of the missing apex x₀ (m)
    level: f32,
    range: (f32, f32),
}

#[rustfmt::skip]
static WINDS: [Wind; NUM_INSTRUMENTS] = [
    // Flute: open–open cylinder, lattice ~2 kHz, jet 6 mm at mf.
    Wind { ex: EX_JET, bore: BORE_OPEN, bore_r: 0.0095, lattice: 2200.0, p_close: 0.0, reed_f: 0.0, reed_q: 0.0, h0: 0.0, width: 0.0, jet_w: 0.006, offset: 0.12, breath: 0.035, vibrato: 0.6, apex: 0.000, level: 1.0, range: (60.0, 96.0) },
    Wind { ex: EX_JET, bore: BORE_OPEN, bore_r: 0.0052, lattice: 3800.0, p_close: 0.0, reed_f: 0.0, reed_q: 0.0, h0: 0.0, width: 0.0, jet_w: 0.0035, offset: 0.12, breath: 0.03, vibrato: 0.5, apex: 0.000, level: 0.9, range: (74.0, 108.0) },
    Wind { ex: EX_JET, bore: BORE_OPEN, bore_r: 0.0125, lattice: 1600.0, p_close: 0.0, reed_f: 0.0, reed_q: 0.0, h0: 0.0, width: 0.0, jet_w: 0.0075, offset: 0.12, breath: 0.04, vibrato: 0.55, apex: 0.000, level: 1.0, range: (55.0, 86.0) },
    // Oboe: narrow cone, double reed (stiff, small opening), lattice ~1.4 kHz: the nasal one.
    Wind { ex: EX_DOUBLE, bore: BORE_CONE, bore_r: 0.0055, lattice: 1400.0, p_close: 11000.0, reed_f: 3300.0, reed_q: 4.0, h0: 1.8e-4, width: 0.007, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.4, apex: 0.035, level: 1.0, range: (58.0, 89.0) },
    Wind { ex: EX_DOUBLE, bore: BORE_CONE, bore_r: 0.0065, lattice: 950.0, p_close: 9000.0, reed_f: 2600.0, reed_q: 4.0, h0: 2.0e-4, width: 0.0075, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.35, apex: 0.045, level: 1.0, range: (52.0, 81.0) },
    // B♭ clarinet: cylinder, single reed on a lay, lattice ~1.5 kHz.
    Wind { ex: EX_REED, bore: BORE_CYL, bore_r: 0.0075, lattice: 1500.0, p_close: 7000.0, reed_f: 2300.0, reed_q: 3.0, h0: 4.0e-4, width: 0.012, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.0, apex: 0.000, level: 1.0, range: (50.0, 91.0) },
    Wind { ex: EX_REED, bore: BORE_CYL, bore_r: 0.0115, lattice: 800.0, p_close: 5000.0, reed_f: 1500.0, reed_q: 3.0, h0: 6.0e-4, width: 0.016, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.0, apex: 0.000, level: 1.05, range: (34.0, 75.0) },
    // Bassoon: long narrow cone, double reed, low lattice ~450 Hz: dark and reedy.
    Wind { ex: EX_DOUBLE, bore: BORE_CONE, bore_r: 0.0085, lattice: 480.0, p_close: 7000.0, reed_f: 1700.0, reed_q: 3.5, h0: 3.0e-4, width: 0.013, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.3, apex: 0.070, level: 1.05, range: (34.0, 72.0) },
    Wind { ex: EX_DOUBLE, bore: BORE_CONE, bore_r: 0.0110, lattice: 260.0, p_close: 5000.0, reed_f: 1100.0, reed_q: 3.5, h0: 4.0e-4, width: 0.016, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.2, apex: 0.120, level: 1.1, range: (22.0, 55.0) },
    // Saxophones: wide cones, single reed, lattice ~1 kHz.
    Wind { ex: EX_REED, bore: BORE_CONE, bore_r: 0.0075, lattice: 1700.0, p_close: 6500.0, reed_f: 2400.0, reed_q: 2.5, h0: 4.5e-4, width: 0.012, jet_w: 0.0, offset: 0.0, breath: 0.006, vibrato: 0.5, apex: 0.050, level: 1.0, range: (56.0, 87.0) },
    Wind { ex: EX_REED, bore: BORE_CONE, bore_r: 0.0095, lattice: 1200.0, p_close: 5500.0, reed_f: 2000.0, reed_q: 2.5, h0: 5.5e-4, width: 0.014, jet_w: 0.0, offset: 0.0, breath: 0.006, vibrato: 0.5, apex: 0.070, level: 1.0, range: (49.0, 80.0) },
    Wind { ex: EX_REED, bore: BORE_CONE, bore_r: 0.0120, lattice: 850.0, p_close: 4800.0, reed_f: 1600.0, reed_q: 2.5, h0: 6.5e-4, width: 0.016, jet_w: 0.0, offset: 0.0, breath: 0.007, vibrato: 0.5, apex: 0.100, level: 1.0, range: (44.0, 75.0) },
    Wind { ex: EX_REED, bore: BORE_CONE, bore_r: 0.0150, lattice: 600.0, p_close: 4200.0, reed_f: 1200.0, reed_q: 2.5, h0: 7.5e-4, width: 0.018, jet_w: 0.0, offset: 0.0, breath: 0.007, vibrato: 0.4, apex: 0.140, level: 1.05, range: (36.0, 68.0) },
    // Alto recorder: duct-fixed jet, little dynamic range, pure.
    Wind { ex: EX_DUCT, bore: BORE_OPEN, bore_r: 0.0085, lattice: 2500.0, p_close: 0.0, reed_f: 0.0, reed_q: 0.0, h0: 0.0, width: 0.0, jet_w: 0.004, offset: 0.08, breath: 0.02, vibrato: 0.15, apex: 0.000, level: 0.9, range: (65.0, 93.0) },
    // E♭ clarinet: small, shrill.
    Wind { ex: EX_REED, bore: BORE_CYL, bore_r: 0.0068, lattice: 1900.0, p_close: 7500.0, reed_f: 2600.0, reed_q: 3.0, h0: 3.6e-4, width: 0.011, jet_w: 0.0, offset: 0.0, breath: 0.004, vibrato: 0.0, apex: 0.000, level: 0.95, range: (55.0, 94.0) },
];

#[inline]
fn jet_ex(ex: u8) -> bool {
    matches!(ex, EX_JET | EX_DUCT)
}

#[inline]
fn p01(p: &Params, id: u32) -> f32 {
    p.get(AULOS_BASE + id).clamp(0.0, 1.0)
}
#[inline]
fn pidx(p: &Params, id: u32, n: usize) -> usize {
    (p.get(AULOS_BASE + id).round().max(0.0) as usize).min(n.saturating_sub(1))
}
#[inline]
fn midi_to_hz(n: f32) -> f32 {
    440.0 * 2f32.powf((n - 69.0) / 12.0)
}

#[derive(Clone, Copy, Debug)]
pub struct Role {
    pub inst: usize,
    pub section: usize,
    pub players: usize,
}
impl Default for Role {
    fn default() -> Self {
        Role { inst: 0, section: 0, players: 1 }
    }
}

struct Player {
    bore: Loop,
    /// Cones: the short open–open stretch on the reed's other side (see `tune`).
    up: Loop,
    up_read: f32,
    lat1: f32,
    lat2: f32,
    lat_b: f32,
    sign: f32,
    dc: f32,
    dc_k: f32,
    out_hp: f32,
    out_x1: f32,
    // reed
    y: f32,
    v: f32,
    k_r: f32, // stiffness per area (Pa/m)
    w_r: f32,
    g_r: f32,
    h0: f32,
    zc: f32,
    width: f32,
    // jet
    jet: Vec<f32>,
    jet_w: usize,
    jet_d: f32,
    q_prev: f32,
    q_prev_v: f32,
    apex_i: f32,
    apex_k: f32,
    jet_lp: f32,
    // breath & player
    p_mouth: f32,
    p_target: f32,
    noise_lp: f32,
    onset: u32,
    cents: f32,
    drift: f32,
    vib_phase: f32,
    vib_rate: f32,
    pan_l: f32,
    pan_r: f32,
    gain: f32,
    f_target: f32,
    // ear
    ear_lp1: f32,
    ear_lp2: f32,
    ear_k: f32,
    ear_hp: f32,
    ear_x1: f32,
    ear_last: f32,
    ear_t: f32,
    ear_period: f32,
    trim: f32,
    trim_s: f32,
    slot_k: f32,
    since_ok: u32,
    votes: i32,
    any_cross: u32,
    period: f32,
}

impl Player {
    fn new() -> Self {
        Player {
            bore: Loop::with_len(BUF),
            up: Loop::with_len(2048),
            up_read: 4.0,
            lat1: 0.0,
            lat2: 0.0,
            lat_b: 0.5,
            sign: -1.0,
            dc: 0.0,
            dc_k: 0.002,
            out_hp: 0.0,
            out_x1: 0.0,
            y: 0.0,
            v: 0.0,
            k_r: 1.0e7,
            w_r: 1.0e4,
            g_r: 3000.0,
            h0: 4e-4,
            zc: 2e6,
            width: 0.012,
            jet: vec![0.0; 1024],
            jet_w: 0,
            jet_d: 20.0,
            q_prev: 0.0,
            q_prev_v: 0.0,
            apex_i: 0.0,
            apex_k: 0.0,
            jet_lp: 0.0,
            p_mouth: 0.0,
            p_target: 0.0,
            noise_lp: 0.0,
            onset: 0,
            cents: 0.0,
            drift: 0.0,
            vib_phase: 0.0,
            vib_rate: 5.0,
            pan_l: 1.0,
            pan_r: 1.0,
            gain: 1.0,
            f_target: 440.0,
            ear_lp1: 0.0,
            ear_lp2: 0.0,
            ear_k: 0.1,
            ear_hp: 0.0,
            ear_x1: 0.0,
            ear_last: 0.0,
            ear_t: 0.0,
            ear_period: 0.0,
            trim: 1.0,
            trim_s: 1.0,
            slot_k: 1.0,
            since_ok: 0,
            votes: 0,
            any_cross: 0,
            period: 100.0,
        }
    }
    fn clear(&mut self) {
        self.bore.clear();
        self.up.clear();
        self.lat1 = 0.0;
        self.lat2 = 0.0;
        self.dc = 0.0;
        self.out_hp = 0.0;
        self.out_x1 = 0.0;
        self.y = 0.0;
        self.v = 0.0;
        self.jet.iter_mut().for_each(|x| *x = 0.0);
        self.q_prev = 0.0;
        self.q_prev_v = 0.0;
        self.apex_i = 0.0;
        self.jet_lp = 0.0;
        self.p_mouth = 0.0;
        self.noise_lp = 0.0;
        self.ear_lp1 = 0.0;
        self.ear_lp2 = 0.0;
        self.ear_hp = 0.0;
        self.ear_x1 = 0.0;
        self.ear_last = 0.0;
        self.ear_t = 0.0;
        self.ear_period = 0.0;
        self.trim = 1.0;
        self.trim_s = 1.0;
        self.slot_k = 1.0;
        self.since_ok = 0;
        self.votes = 0;
        self.any_cross = 0;
    }
}

pub struct AulosVoice {
    sr: f32,
    players: Vec<Player>,
    np: usize,
    pub role: Role,
    inst: usize,
    artic: usize,
    vel: f32,
    dyn_: f32,
    mod_dyn: bool,
    expr: f32,
    expr_init: bool,
    bend: f32,
    glide: f32,
    vib_amt: f32,
    norm: f32,
    tilt_lp: [f32; 2],
    tilt_k: f32,
    click: u32,
    click_amp: f32,
    click_bp: crate::tonos::Bp,
    t: u32,
    released: bool,
    level: f32,
    attack: f32,
    stacc: u32,
}

impl AulosVoice {
    pub fn new(sr: f32) -> Self {
        AulosVoice {
            sr,
            players: (0..MAX_PLAYERS).map(|_| Player::new()).collect(),
            np: 1,
            role: Role::default(),
            inst: 0,
            artic: 0,
            vel: 0.0,
            dyn_: 0.5,
            mod_dyn: false,
            expr: 0.0,
            expr_init: false,
            bend: 1.0,
            glide: 1.0,
            vib_amt: 0.0,
            norm: 1.0,
            tilt_lp: [0.0; 2],
            tilt_k: 0.2,
            click: 0,
            click_amp: 0.0,
            click_bp: crate::tonos::Bp::default(),
            t: 0,
            released: true,
            level: 0.0,
            attack: 0.01,
            stacc: 0,
        }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr;
    }

    pub fn reset(&mut self) {
        for pl in self.players.iter_mut() {
            pl.clear();
        }
        self.tilt_lp = [0.0; 2];
        self.level = 0.0;
        self.released = true;
        self.t = 0;
        self.click = 0;
    }

    pub fn samples(&self) -> u32 {
        self.t
    }
    pub fn is_sustained(&self) -> bool {
        self.artic != ART_STACCATO
    }
    pub fn is_quiet(&self) -> bool {
        if !self.released && self.stacc == 0 {
            return false;
        }
        self.t as f32 > self.sr * 0.08 && self.level < 1.5e-5
    }

    /// Tune player k's bore to `f` (Hz): the round trip including the lattice filter's phase, the
    /// wall-loss filter's, and (for a cylinder) the open end's inversion — half a period.
    fn tune(&mut self, k: usize, f: f32) {
        let sr = self.sr;
        let w = &WINDS[self.inst];
        let pl = &mut self.players[k];
        let f = f * 2f32.powf(pl.cents / 1200.0);
        let period = sr / f;
        let wv = TAU * f / sr;
        // Wall loss (√f, nepers/m) over the round trip, at the note.
        let len = C_AIR * period / sr * if w.bore == BORE_CYL { 0.5 } else { 1.0 };
        pl.apex_k = 0.0;
        let alpha = 3.0e-5 * f.sqrt() / w.bore_r;
        let fh = (8.0 * f).min(0.3 * sr);
        let alpha_h = 3.0e-5 * fh.sqrt() / w.bore_r;
        let (g, lb) = crate::perform::fit_onepole((-alpha * len).exp().min(0.998), (-alpha_h * len).exp(), wv, TAU * fh / sr);
        let pd = onepole_pd(lb, wv) + 2.0 * onepole_pd(pl.lat_b, wv);
        // Closed–open cylinder: f = c/4L → round trip half a period. Open–open: a period. A
        // truncated cone resonates at n·c/2(L + x₀): the round trip is a period less the apex.
        // A cone resonates like an open–open cylinder of its length (Benade): the reed sits a
        // fraction β of the way along it (β from the missing apex), with a wave line on each side,
        // both ends open. The two round trips add to one period.
        let beta = if w.bore == BORE_CONE { (2.0 * w.apex * f / C_AIR).clamp(0.06, 0.35) } else { 0.0 };
        let loop_d = match w.bore {
            BORE_CYL => 0.5 * period,
            BORE_CONE => (1.0 - beta) * period,
            _ => period,
        };
        let read = (loop_d - pd - 1.0).max(2.0);
        if w.bore == BORE_CONE {
            let pd_up = onepole_pd(lb, wv);
            pl.up.g = g;
            pl.up.b = lb;
            pl.up.nap = 0;
            pl.up_read = (beta * period - pd_up - 1.0).clamp(1.0, 2000.0);
        }
        pl.bore.g = g;
        pl.bore.b = lb;
        pl.bore.nap = 0;
        pl.bore.pd = 0.0;
        if self.t == 0 {
            pl.bore.period = read;
        }
        pl.bore.target = read;
        pl.period = period;
        pl.f_target = f;
        pl.ear_k = 1.0 - (-TAU * f * 1.3 / sr).exp();
        if matches!(w.ex, EX_JET | EX_DUCT) {
            // The jet's travel time: ~0.45 of a period (the flautist moves the lips to keep it so).
            pl.jet_d = (0.45 * period).clamp(2.0, (pl.jet.len() - 4) as f32);
        }
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        self.reset();
        self.released = false;
        let sr = self.sr;
        self.vel = velocity.clamp(0.0, 1.0);
        self.inst = self.role.inst.min(NUM_INSTRUMENTS - 1);
        let w = &WINDS[self.inst];
        self.artic = pidx(p, AU_ARTIC, ARTIC_NAMES.len());
        self.mod_dyn = p01(p, AU_MOD_DYN) > 0.5;
        let vs = p01(p, AU_VEL_SENS);
        let v = 1.0 - vs + vs * self.vel;
        // With the mod wheel as dynamics the note is voiced at a reference mf and the wheel scales it
        // from there (the wheel's real value arrives on the first sample).
        self.expr_init = false;
        self.dyn_ = if self.mod_dyn { 0.5 } else { (v * (0.4 + 1.2 * p01(p, AU_DYNAMICS))).clamp(0.02, 1.0) };
        let port = p01(p, AU_PORTAMENTO);
        self.glide = 1.0 - (-1.0 / (sr * (0.003 + 0.12 * port * port))).exp();
        self.vib_amt = p01(p, AU_VIB_DEPTH) * 2.0 * w.vibrato.max(0.15);
        self.attack = match self.artic {
            ART_LEGATO => 0.03,
            ART_BREATH => 0.09,
            ART_ACCENT | ART_STACCATO => 0.006,
            _ => 0.008 + 0.03 * (1.0 - p01(p, AU_TONGUE)),
        };
        self.stacc = if self.artic == ART_STACCATO { (sr * (0.06 + 0.07 * (1.0 - self.vel))) as u32 } else { 0 };
        let rep = self.role.players.max(1);
        let cap = 1 + (p01(p, AU_QUALITY) * (MAX_PLAYERS - 1) as f32).round() as usize;
        self.np = rep.min(cap).min(MAX_PLAYERS);
        let each = (rep as f32).powf(0.25) / (self.np as f32).sqrt();
        let intonation = p01(p, AU_INTONATION);
        let tight = p01(p, AU_TIGHTNESS);
        let width = p01(p, AU_WIDTH);
        let reed = 2f32.powf((p01(p, AU_REED) - 0.5) * 1.2); // reed hardness
        let embouchure = p01(p, AU_EMBOUCHURE);
        let lattice = 2f32.powf((p01(p, AU_LATTICE) - 0.5) * 1.5);
        let centre: f32 = match self.role.section {
            0 => 0.0,
            1 => -0.3, // flutes
            2 => -0.05, // oboes
            3 => 0.15, // clarinets
            _ => 0.35, // bassoons
        } * (0.4 + 0.6 * width);
        let zc = RHO * C_AIR / (PI * w.bore_r * w.bore_r);
        for k in 0..self.np {
            let pl = &mut self.players[k];
            pl.clear();
            let hum = if rep == 1 { 0.3 } else { 1.0 };
            pl.cents = if k == 0 && rep == 1 { 0.0 } else { rng.bipolar() * (1.0 + 6.0 * intonation) * hum };
            pl.onset = if k == 0 { 0 } else { (rng.next_f32() * (0.004 + 0.025 * tight) * sr) as u32 };
            let pan = (centre + if rep > 1 { rng.bipolar() * 0.12 * (0.3 + width) } else { 0.0 }).clamp(-1.0, 1.0);
            pl.pan_l = (1.0 - pan).sqrt();
            pl.pan_r = (1.0 + pan).sqrt();
            pl.gain = each * if k == 0 { 1.0 } else { 0.85 + 0.3 * rng.next_f32() };
            pl.vib_rate = 4.8 + 1.0 * rng.next_f32();
            pl.vib_phase = rng.next_f32() * TAU;
            // Reed on a cylinder: the open end inverts (odd harmonics). Reed on a cone: the loop
            // keeps its sign for sound (all harmonics) but the open end still lets the mean flow
            // out (DC inverted). Flute: both ends open — the far end inverts and so does the
            // embouchure (below).
            pl.sign = -1.0;
            pl.dc_k = 1.0 - (-TAU * 15.0 / sr).exp();
            pl.lat_b = (-TAU * w.lattice * lattice / sr).exp();
            pl.zc = zc;
            match w.ex {
                EX_REED | EX_DOUBLE => {
                    // Reed: closes at p_M = K·H0; resonance ω_r; ζ from the lip on the reed.
                    let pm = w.p_close * reed;
                    pl.h0 = w.h0 * (0.75 + 0.5 * embouchure);
                    pl.k_r = pm / pl.h0;
                    pl.w_r = TAU * w.reed_f * reed.sqrt();
                    pl.g_r = pl.w_r / w.reed_q;
                    pl.width = w.width;
                    // γ: just past threshold at pp, beating at ff.
                    let gamma = 0.42 + 0.45 * self.dyn_;
                    pl.p_target = gamma * pm * (1.0 + rng.bipolar() * 0.03 * hum);
                }
                _ => {
                    // Jet: blowing pressure 200 Pa (pp, low) … 1.5 kPa (ff, high).
                    let reg = ((note_hz / midi_to_hz(w.range.0)).log2() / 3.0).clamp(0.0, 1.0);
                    let duct = if w.ex == EX_DUCT { 0.4 } else { 1.0 };
                    pl.p_target = (180.0 + 900.0 * self.dyn_ * duct + 900.0 * reg) * (1.0 + rng.bipolar() * 0.03 * hum);
                }
            }
        }
        for k in 0..self.np {
            self.tune(k, note_hz);
            let pl = &mut self.players[k];
            pl.bore.period = pl.bore.target;
            pl.bore.read = pl.bore.target;
        }
        // Key click / tongue: a short knock at the start.
        self.click = (sr * 0.006) as u32;
        self.click_amp = 0.02 + 0.03 * self.vel;
        self.click_bp = crate::tonos::Bp::new(1800.0 + 1200.0 * rng.next_f32(), 3.0, sr);
        self.tilt_k = 1.0 - (-TAU * 1500.0 / sr).exp();
        self.norm = w.level * match w.ex {
            EX_JET | EX_DUCT => 0.6 / 60.0,
            _ => 0.25 / w.p_close,
        };
        self.t = 0;
    }

    pub fn slur(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        if self.released || self.t == 0 {
            self.trigger(note_hz, velocity, p, rng);
            return;
        }
        for k in 0..self.np {
            self.tune(k, note_hz);
            let pl = &mut self.players[k];
            pl.slot_k = 1.0;
            pl.votes = 0;
        }
        // Fingers on keys.
        self.click = (self.sr * 0.004) as u32;
        self.click_amp = 0.012;
        self.vel = velocity.clamp(0.0, 1.0);
    }

    pub fn release(&mut self) {
        self.released = true;
    }

    pub fn render_sample(&mut self, bend: f32, mod_wheel: f32, rng: &mut Rng) -> (f32, f32) {
        let sr = self.sr;
        let dt = 1.0 / sr;
        if !self.expr_init {
            self.expr = mod_wheel;
            self.expr_init = true;
        }
        self.expr += (mod_wheel - self.expr) * 0.002;
        self.bend += (bend - self.bend) * 0.01;
        if self.stacc > 0 && self.t >= self.stacc && !self.released {
            self.released = true;
        }
        let w = &WINDS[self.inst];
        let artic = self.artic;
        let dyn_now = if self.mod_dyn { self.expr.max(0.02) } else { self.dyn_ };
        let dyn_k = if self.mod_dyn { (0.42 + 0.45 * dyn_now) / (0.42 + 0.45 * self.dyn_) } else { 1.0 };
        let jet = matches!(w.ex, EX_JET | EX_DUCT);
        let (mut ol, mut or) = (0.0f32, 0.0f32);
        for k in 0..self.np {
            let pl = &mut self.players[k];
            if self.t < pl.onset {
                continue;
            }
            let pt = (self.t - pl.onset) as f32 * dt;
            // Breath.
            let mut target = if self.released { 0.0 } else { pl.p_target * dyn_k * pl.slot_k };
            match artic {
                ART_ACCENT => target *= 1.0 + 0.4 * (-pt / 0.07).exp(),
                ART_FLUTTER => target *= 0.8 + 0.2 * (TAU * 22.0 * pt).sin(),
                _ => {}
            }
            let rate = if target > pl.p_mouth { dt / self.attack } else { dt / 0.03 };
            pl.p_mouth += (target - pl.p_mouth) * rate.min(1.0);
            pl.vib_phase += TAU * pl.vib_rate * dt;
            if pl.vib_phase > TAU {
                pl.vib_phase -= TAU;
            }
            let vin = ((pt - 0.3) / 0.4).clamp(0.0, 1.0);
            let vib_k = self.vib_amt * 0.05 * vin + if self.mod_dyn { 0.0 } else { 0.05 * self.expr };
            let mut pm = pl.p_mouth * (1.0 + vib_k * pl.vib_phase.sin());
            if artic == ART_GROWL {
                pl.noise_lp += (rng.bipolar() - pl.noise_lp) * 0.06;
                pm *= 1.0 + 0.3 * pl.noise_lp;
            }
            if self.t % 64 == 0 {
                pl.drift += (rng.bipolar() * 0.4 - pl.drift * 0.03) * 0.05;
            }
            pl.trim_s += (pl.trim - pl.trim_s) * 0.0015;
            let tune = self.bend * pl.trim_s * (1.0 + pl.drift * 0.000_577);
            pl.bore.period += (pl.bore.target - pl.bore.period) * self.glide;
            let read = (pl.bore.period / tune).clamp(2.0, (BUF - 8) as f32);

            // The returning wave at the mouthpiece / embouchure.
            let ret = pl.bore.read_at(read);
            pl.lat1 = (1.0 - pl.lat_b) * ret + pl.lat_b * pl.lat1;
            pl.lat2 = (1.0 - pl.lat_b) * pl.lat1 + pl.lat_b * pl.lat2;
            let refl = pl.lat2;
            let leak = ret - refl; // what the open holes and bell let out
            let p_in = -refl;
            // Cones: the wave coming back from the short side (open end, inverted).
            let cone = w.bore == BORE_CONE;
            let p_up = if cone { -pl.up.read_at((pl.up_read / tune).clamp(1.0, 2000.0)) } else { 0.0 };

            let (p_out, p_mp) = if jet {
                // Acoustic velocity in the embouchure hole (last sample): (p_out − p_in)/(Zc·S).
                let v_ac = pl.q_prev_v;
                pl.jet[pl.jet_w] = v_ac;
                pl.jet_w = (pl.jet_w + 1) % pl.jet.len();
                let d = pl.jet_d / tune;
                let di = d.floor() as usize;
                let fr = d - di as f32;
                let n = pl.jet.len();
                let a0 = pl.jet[(pl.jet_w + n - 1 - di) % n];
                let a1 = pl.jet[(pl.jet_w + n - 2 - di) % n];
                let v_del = a0 * (1.0 - fr) + a1 * fr;
                let uj = (2.0 * pm.max(0.0) / RHO).sqrt().max(0.5);
                // Deflection at the edge: the velocity disturbance, grown along the jet (≈ e^{μW},
                // folded into the gain) and scaled by how long the jet takes: W / U_j.
                let b = 0.0006; // jet half-width (m)
                let jet_len = w.jet_w;
                let eta = v_del * (jet_len / uj) * 4.0;
                // Breath turbulence on the jet.
                pl.noise_lp += (rng.bipolar() - pl.noise_lp) * 0.6;
                let turb = pl.noise_lp * w.breath * if artic == ART_BREATH { 3.0 } else { 1.0 };
                let q = b * 0.012 * uj * ((eta - w.offset * b) / b + turb * 6.0).tanh();
                // Jet drive: Δp = ρ·δ/S · dq/dt (δ ≈ 5 mm end correction, S the hole's area).
                let s_hole = 1.0e-4;
                let src = RHO * 0.005 / s_hole * (q - pl.q_prev) * sr;
                pl.q_prev = q;
                pl.jet_lp += (src - pl.jet_lp) * 0.6;
                // Open embouchure end: the incoming wave reflects inverted, plus the source.
                let po = -p_in + pl.jet_lp;
                pl.q_prev_v = (po - p_in) / (pl.zc * s_hole) * 1.0e-4 * 1.0e4;
                (po, po + p_in)
            } else {
                // Reed: Bernoulli flow through the opening, implicit with p_mp = 2·p_in + Zc·u.
                let h = (pl.h0 + pl.y).max(0.0);
                let g = pl.width * h * (2.0 / RHO).sqrt();
                // A cone's spherical waves: the flow the bore takes has a mass term at the apex,
                // −(S/ρx₀)∫p dt, i.e. Zc·κ·∫p = (c/x₀)·∫p dt in pressure.
                // Solved implicitly with the bore and the apex inertance together:
                //   p_mp = (2·p_in + Zc·u − k·I) / (1 + k·dt),  I ← I + p_mp·dt
                // (an explicit integrator lags a sample inside the loop and wrecks the resonances).
                // Cylinder: p_mp = 2·p_in + Zc·u. Cone (reed between two lines, Zc ∥ Zc):
                // p_mp = p_in + p_up + (Zc/2)·u.
                let (zc_e, base) = if cone { (0.5 * pl.zc, p_in + p_up) } else { (pl.zc, 2.0 * p_in) };
                let d0 = pm - base;
                let u = if g <= 0.0 {
                    0.0
                } else {
                    let g2 = g * g;
                    0.5 * (-g2 * zc_e + (g2 * g2 * zc_e * zc_e + 4.0 * g2 * d0.abs()).sqrt()) * d0.signum()
                };
                pl.noise_lp += (rng.bipolar() - pl.noise_lp) * 0.5;
                let u = u * (1.0 + w.breath * pl.noise_lp);
                let p_mp = base + zc_e * u;
                if cone {
                    let o = pl.up.filter(p_mp - p_up);
                    pl.up.write(o);
                }
                // Reed dynamics (two substeps): the pressure difference pushes it shut.
                let dp = pm - p_mp;
                let hs = 0.5 * dt;
                for _ in 0..2 {
                    let acc = -dp / pl.k_r * pl.w_r * pl.w_r - pl.g_r * pl.v - pl.w_r * pl.w_r * pl.y;
                    pl.v += acc * hs;
                    pl.y += pl.v * hs;
                    if pl.h0 + pl.y < 0.0 {
                        pl.y = -pl.h0; // beats against the lay
                        pl.v = 0.0;
                    }
                }
                // Outgoing wave: what isn't the returning one.
                (p_mp - p_in, p_mp)
            };
            let back = pl.bore.filter(p_out);
            pl.bore.write(back);

            // The player's ear (fundamental of the mouthpiece pressure) → embouchure and register.
            pl.ear_lp1 += (p_mp - pl.ear_lp1) * pl.ear_k;
            pl.ear_lp2 += (pl.ear_lp1 - pl.ear_lp2) * pl.ear_k;
            let hp = 0.995 * (pl.ear_hp + pl.ear_lp2 - pl.ear_x1);
            pl.ear_x1 = pl.ear_lp2;
            pl.ear_hp = hp;
            pl.ear_t += 1.0;
            if pl.ear_last < 0.0 && hp >= 0.0 {
                pl.any_cross += 1;
                let frac = pl.ear_last / (pl.ear_last - hp);
                let per = pl.ear_t - 1.0 + frac;
                pl.ear_t = 1.0 - frac;
                let expect = sr / (pl.f_target * self.bend);
                if per < expect * 0.8 && per > expect * 0.3 {
                    pl.votes += 1;
                } else if per > expect * 1.25 && per < expect * 3.2 {
                    pl.votes -= 1;
                }
                if per > expect * 0.8 && per < expect * 1.25 {
                    pl.since_ok = 0;
                    pl.votes = 0;
                    pl.ear_period = if pl.ear_period > 0.0 { 0.7 * pl.ear_period + 0.3 * per } else { per };
                    let err = (expect / pl.ear_period).ln();
                    if pt > 0.02 && !self.released {
                        pl.trim = (pl.trim_s * (-err * 0.5).exp()).clamp(0.92, 1.08);
                    }
                }
            }
            pl.ear_last = hp;
            pl.since_ok += 1;
            if !self.released && pt > 0.03 && self.t % 512 == 0 {
                let expect = sr / pl.f_target;
                if pl.votes > 4 {
                    // Cracked up (overblown): blow less.
                    pl.slot_k = (pl.slot_k * 0.93).max(0.4);
                    pl.votes = 0;
                } else if pl.votes < -4 || (pl.since_ok as f32 > 3.0 * expect + 0.02 * sr && pl.any_cross < 2) {
                    // Too low or not speaking: more air.
                    pl.slot_k = (pl.slot_k * 1.06).min(1.8);
                    pl.votes = 0;
                }
                pl.any_cross = 0;
            }

            // Radiation: what leaks from the lattice and bell, plus (flutes) the embouchure.
            pl.out_hp = 0.995 * (pl.out_hp + leak - pl.out_x1);
            pl.out_x1 = leak;
            let mut y = pl.out_hp;
            if jet {
                // The embouchure radiates too (and carries the breath).
                y += 0.25 * (p_out + p_in);
            }
            let y = y * pl.gain;
            ol += y * pl.pan_l;
            or += y * pl.pan_r;
        }
        let mut l = ol * self.norm;
        let mut r = or * self.norm;
        if self.click > 0 {
            let n = rng.bipolar() * self.click_amp * (self.click as f32 / (self.sr * 0.006));
            let c = self.click_bp.tick(n);
            l += c;
            r += c;
            self.click -= 1;
        }
        // Player layer (as CORNU): loudness range and brightness toward ff.
        let gain = 10f32.powf((dyn_now - 0.6) * 0.6);
        let tilt = -0.3 + 1.0 * dyn_now;
        self.tilt_lp[0] += (l - self.tilt_lp[0]) * self.tilt_k;
        self.tilt_lp[1] += (r - self.tilt_lp[1]) * self.tilt_k;
        l = (l + tilt * (l - self.tilt_lp[0])) * gain;
        r = (r + tilt * (r - self.tilt_lp[1])) * gain;
        let a = l.abs().max(r.abs());
        self.level = if a > self.level { a } else { self.level * 0.9995 };
        self.t = self.t.wrapping_add(1);
        if !l.is_finite() || !r.is_finite() {
            self.reset();
            return (0.0, 0.0);
        }
        (l.clamp(-4.0, 4.0), r.clamp(-4.0, 4.0))
    }
}

/// Sections high → low: (instrument, seat, players).
pub fn ensemble_sections(ens: usize) -> ([(usize, usize, usize); 5], usize) {
    let mut s = [(0usize, 0usize, 1usize); 5];
    let n = match ens {
        1 => {
            s[..4].copy_from_slice(&[(0, 1, 1), (3, 2, 1), (5, 3, 1), (7, 4, 1)]);
            4
        }
        2 => {
            s[..4].copy_from_slice(&[(1, 1, 1), (0, 1, 1), (0, 1, 1), (2, 1, 1)]);
            4
        }
        3 => {
            s[..4].copy_from_slice(&[(14, 3, 1), (5, 3, 2), (5, 3, 2), (6, 3, 1)]);
            4
        }
        4 => {
            s.copy_from_slice(&[(1, 1, 1), (0, 1, 2), (3, 2, 2), (5, 3, 2), (7, 4, 2)]);
            5
        }
        5 => {
            s.copy_from_slice(&[(10, 2, 1), (10, 2, 1), (11, 3, 1), (11, 3, 1), (12, 4, 1)]);
            5
        }
        _ => 1,
    };
    (s, n)
}

pub fn section_range(inst: usize) -> (f32, f32, f32) {
    let w = &WINDS[inst.min(NUM_INSTRUMENTS - 1)];
    (w.range.0 + 3.0, w.range.1 - 3.0, w.range.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    const SR: f32 = 48000.0;

    fn params(artic: usize) -> Params {
        let mut p = Params::new();
        p.set(AULOS_BASE + AU_ENABLE, 1.0);
        p.set(AULOS_BASE + AU_ARTIC, artic as f32);
        p.set(AULOS_BASE + AU_VIB_DEPTH, 0.0);
        p
    }

    fn render(p: &Params, inst: usize, midi: f32, vel: f32, secs: f32, hold: f32) -> Vec<f32> {
        let mut v = AulosVoice::new(SR);
        let mut rng = Rng(99);
        v.role = Role { inst, section: 0, players: 1 };
        v.trigger(midi_to_hz(midi), vel, p, &mut rng);
        let n = (secs * SR) as usize;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            if i == (hold * SR) as usize {
                v.release();
            }
            let (l, r) = v.render_sample(1.0, 0.0, &mut rng);
            out.push(0.5 * (l + r));
        }
        out
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    fn f0(x: &[f32]) -> (f32, f32) {
        let n = x.len().min(9000);
        let mut best = (1usize, -1.0f32);
        let mut prev_r = 1.0f32;
        let mut rising = false;
        for lag in 12..(x.len() - n).min(2400) {
            let (mut c, mut e1, mut e2) = (0.0f32, 0.0f32, 0.0f32);
            for i in 0..n {
                c += x[i] * x[i + lag];
                e1 += x[i] * x[i];
                e2 += x[i + lag] * x[i + lag];
            }
            let r = c / (e1 * e2).sqrt().max(1e-20);
            if r > prev_r {
                rising = true;
            }
            if rising && r > best.1 {
                best = (lag, r);
            }
            if rising && r < best.1 - 0.15 && best.1 > 0.6 {
                break;
            }
            prev_r = r;
        }
        (SR / best.0 as f32, best.1)
    }

    #[test]
    #[ignore = "AULOS is work in progress: cones and jets don't speak yet"]
    fn aulos_every_instrument_speaks_in_tune() {
        let mut fails = Vec::new();
        let mut total = 0;
        for inst in 0..NUM_INSTRUMENTS {
            let w = &WINDS[inst];
            for &n in &[(w.range.0 + 4.0).round(), ((w.range.0 + w.range.1) * 0.5).round(), (w.range.1 - 5.0).round()] {
                for &vel in &[0.35f32, 0.9] {
                    total += 1;
                    let x = render(&params(0), inst, n, vel, 1.0, 1.0);
                    assert!(x.iter().all(|v| v.is_finite()), "{} {} non-finite", INSTRUMENT_NAMES[inst], n);
                    let y = &x[(0.4 * SR) as usize..];
                    let (f, r) = f0(y);
                    let cents = 1200.0 * (f / midi_to_hz(n)).log2();
                    if rms(y) < 3e-4 || cents.abs() > 30.0 || r < 0.7 {
                        fails.push(format!("{} n{} v{}: rms {:.4} {:+.0}c r{:.2}", INSTRUMENT_NAMES[inst], n, vel, rms(y), cents, r));
                    }
                }
            }
        }
        if !fails.is_empty() {
            println!("off notes ({}/{}):\n{}", fails.len(), total, fails.join("\n"));
        }
        assert!(fails.len() * 20 <= total, "{} of {} notes failed:\n{}", fails.len(), total, fails.join("\n"));
    }

    #[test]
    #[ignore = "AULOS is work in progress: cones and jets don't speak yet"]
    fn aulos_clarinet_is_odd_and_oboe_is_full() {
        // Clarinet (cylinder): the 2nd harmonic is far weaker than the 3rd; oboe (cone): not.
        let h = |x: &[f32], f: f32, k: f32| -> f32 {
            let w = TAU * f * k / SR;
            let (mut re, mut im) = (0.0f32, 0.0f32);
            for (i, &v) in x.iter().enumerate() {
                re += v * (w * i as f32).cos();
                im += v * (w * i as f32).sin();
            }
            (re * re + im * im).sqrt()
        };
        let n = 55.0;
        let f = midi_to_hz(n);
        let cl = render(&params(0), 5, n, 0.6, 1.0, 1.0);
        let ob = render(&params(0), 3, 67.0, 0.6, 1.0, 1.0);
        let (c2, c3) = (h(&cl[(0.4 * SR) as usize..], f, 2.0), h(&cl[(0.4 * SR) as usize..], f, 3.0));
        let fo = midi_to_hz(67.0);
        let (o1, o2) = (h(&ob[(0.4 * SR) as usize..], fo, 1.0), h(&ob[(0.4 * SR) as usize..], fo, 2.0));
        assert!(c2 < c3 * 0.6, "clarinet even harmonic too strong: h2 {} h3 {}", c2, c3);
        assert!(o2 > o1 * 0.1, "oboe second harmonic missing: h1 {} h2 {}", o1, o2);
    }

    #[test]
    #[ignore = "AULOS is work in progress: cones and jets don't speak yet"]
    fn aulos_articulations_are_stable() {
        for a in 0..ARTIC_NAMES.len() {
            for inst in 0..NUM_INSTRUMENTS {
                let w = &WINDS[inst];
                let n = ((w.range.0 + w.range.1) * 0.5).round();
                let x = render(&params(a), inst, n, 0.8, 1.0, 0.6);
                assert!(x.iter().all(|v| v.is_finite()), "{} {}", ARTIC_NAMES[a], INSTRUMENT_NAMES[inst]);
                let peak = x.iter().fold(0.0f32, |q, v| q.max(v.abs()));
                assert!(peak < 3.9, "{} {} peak {}", ARTIC_NAMES[a], INSTRUMENT_NAMES[inst], peak);
            }
        }
    }

    /// `cargo test --release aulos_diag -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn aulos_diag() {
        for inst in 0..NUM_INSTRUMENTS {
            let w = &WINDS[inst];
            let mut line = format!("{:18}", INSTRUMENT_NAMES[inst]);
            let mut n = w.range.0;
            while n <= w.range.1 {
                let x = render(&params(0), inst, n, 0.6, 1.0, 1.0);
                let y = &x[(0.4 * SR) as usize..];
                let (f, r) = f0(y);
                line += &format!(" {}:{:+.0}{}/{:.5}", n, 1200.0 * (f / midi_to_hz(n)).log2(), if r < 0.7 { "?" } else { "" }, rms(y));
                n += 5.0;
            }
            println!("{}", line);
        }
    }
}
#[cfg(test)]
mod probe {
    use super::*;
    #[test]
    #[ignore]
    fn aulos_probe() {
        let sr = 48000.0;
        for &(inst, n) in &[(10usize, 61.0f32), (3, 67.0), (4, 62.0), (7, 46.0), (9, 70.0), (11, 56.0), (12, 48.0), (8, 34.0)] {
            let mut hits = 0;
            for &bk in &[0.25f32, 0.33, 0.4, 0.45] {
                for &gk in &[0.7f32, 1.0, 1.5, 2.2] {
                    for &hk in &[1.0f32, 2.0, 4.0] {
                        for &q in &[0.7f32, 2.5] {
                            let mut p = Params::new();
                            p.set(AULOS_BASE + AU_ENABLE, 1.0);
                            let mut v = AulosVoice::new(sr);
                            let mut rng = Rng(99);
                            v.role = Role { inst, section: 0, players: 1 };
                            v.trigger(midi_to_hz(n), 0.6, &p, &mut rng);
                            {
                                let pl = &mut v.players[0];
                                pl.g_r = pl.w_r / q; pl.p_target *= gk; pl.h0 *= hk; pl.k_r /= hk;
                                let per = pl.period;
                                // move the reed along the tube: rescale the short side and the long side
                                let up = per * bk;
                                let lo_shift = up - (pl.up_read + 1.0);
                                pl.up_read = (up - 1.0).max(1.0);
                                pl.bore.target = (pl.bore.target - lo_shift).max(2.0);
                                pl.bore.period = pl.bore.target;
                                let _ = per;
                            }
                            let mut x = Vec::new();
                            for _ in 0..(0.8 * sr) as usize { let (l, r) = v.render_sample(1.0, 0.0, &mut rng); x.push(0.5 * (l + r)); }
                            let y = &x[(0.4 * sr) as usize..];
                            let rm = (y.iter().map(|q| q * q).sum::<f32>() / y.len() as f32).sqrt();
                            let zc = y.windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count() as f32 / 0.4;
                            let want = midi_to_hz(n);
                            if rm > 2e-3 && (zc / want - 1.0).abs() < 0.2 { hits += 1; if hits < 6 { println!("{} β={} γ×{} h0×{} q{}: rms {:.4} zc {:.0} (want {:.0})", INSTRUMENT_NAMES[inst], bk, gk, hk, q, rm, zc, want); } }
                        }
                    }
                }
            }
            println!("{}: {} working settings", INSTRUMENT_NAMES[inst], hits);
        }
    }
}
