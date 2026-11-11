//! TONOS — world strings, simulated as strings. Asia, India, the Middle East, Europe and Africa:
//! guzheng to kora, sitar to hurdy-gurdy. No samples and no oscillators — every note is a string
//! of a real length, tension and material, set moving by a finger, nail, plectrum, bachi, hammer,
//! bow or wheel, and heard through the body it is stretched over.
//!
//! The string. Velocity waves travel a loop whose round trip is exactly the note's period. Its
//! physics comes from the instrument, not from a tone control:
//!   · wave speed c = 2·L·f, linear density μ = T / c², diameter from μ and the material density;
//!   · inharmonicity B = π³·E·d⁴ / (64·T·L²) (Fletcher) → a cascade of first-order allpasses fitted
//!     at note-on so partial n lands at n·f₀·√(1+B·n²);
//!   · losses (Valette & Cuesta): air drag R = 2πη + 2πd√(πηρ_air·f), internal visco-elastic
//!     friction 4π²μEIδ·f²/T², a material floor, and the stopping finger, fret or tangent — fitted
//!     as a one-pole loss filter at f₀ and an upper partial;
//!   · tension modulation: T(t) = T₀ + EA·ΔL/L with ΔL/L = ½∫(∂y/∂x)² — the pitch glide of a hard
//!     pluck on a slack string, and the longitudinal pull it puts on the bridge;
//!   · pitch bend and vibrato change tension or stopped length, which is what a player's hand does.
//!
//! The excitations are contact mechanics: a pluck releases the static shape a point force leaves
//! (A = F·β(1−β)L/T); a hammer is a Hertzian mass F = K·δᵖ integrated against the string's
//! impedance; a bow or a hurdy-gurdy wheel is the McIntyre–Schumacher–Woodhouse stick-slip with a
//! hyperbolic friction curve, its force set inside Schelleng's playable window.
//!
//! The bridge. Curved jawari / sawari bridges (sitar, tanpura, veena, shamisen, biwa, begena's
//! leather thongs) are a unilateral obstacle the string wraps onto — a constraint impulse on the
//! waves at the contact points, rigid or soft. Loose rattlers (kora's sesse, the gimbri's sersal,
//! the hurdy-gurdy's chien) are free masses that leave their seat when the bridge falls faster than
//! their preload allows and clatter back down. The bridge moves: its velocity is the body's modal
//! admittance driven by the string's force, and that motion is fed back into the string
//! (R = (1 − Z₀Y)/(1 + Z₀Y)), so notes on a body resonance die faster (wolf and dead notes) and the
//! strings of a course share energy through it — the two-stage decay of doubled courses.
//!
//! The body is a modal admittance built from its construction: a skin's Bessel modes from its
//! radius, tension and areal density (f₀₁ = 2.405/(2πa)·√(Tₛ/σ)), a wooden plate's modes, a gourd's
//! Helmholtz air, a bamboo tube's air column. Sympathetic strings (sitar tarafs, sarangi, rubab,
//! nyckelharpa, Hardanger fiddle) live in TonosRack, driven by the instrument's sound.
//!
//! Everything allocates at construction (`new` / `set_sample_rate`), never on the audio thread.

use crate::osc::Rng;
use crate::params::*;
use std::f32::consts::PI;

const TAU: f32 = 2.0 * PI;
const ETA_AIR: f32 = 1.8e-5; // Pa·s
const RHO_AIR: f32 = 1.2; // kg/m³

// ── excitations, stops, materials, bodies ───────────────────────────────────────────────────────

pub const EX_FINGER: u8 = 0; // flesh pluck
pub const EX_NAIL: u8 = 1; // fingernail / fingerpick (tsume, guzheng picks, qanun rings)
pub const EX_PLECTRUM: u8 = 2; // risha, mizrab, tezene, pick
pub const EX_BACHI: u8 = 3; // big spatula: plucks and slaps the skin
pub const EX_HAMMER: u8 = 4; // santur mezrab, yangqin bamboo, cimbalom beater, musical-bow stick
pub const EX_BOW: u8 = 5;
pub const EX_WHEEL: u8 = 6; // hurdy-gurdy: rosined wheel, endless bow
pub const EX_HARMONIC: u8 = 7; // đàn bầu: pluck while the palm touches a node

const STOP_OPEN: u8 = 0; // one string per note (zithers, harps, lyres)
const STOP_FRET: u8 = 1;
const STOP_FRETLESS: u8 = 2; // fingertip on a fingerboard
const STOP_AIR: u8 = 3; // no fingerboard: the finger presses the string in the air (erhu, sarangi)
const STOP_TANGENT: u8 = 4; // wooden key tangent (hurdy-gurdy, nyckelharpa)

const RATTLE_NONE: u8 = 0;
const RATTLE_SESSE: u8 = 1; // kora / kamale n'goni: tin plate with rings on the bridge
const RATTLE_SERSAL: u8 = 2; // gimbri: tin plate with rings on the neck head
const RATTLE_CHIEN: u8 = 3; // hurdy-gurdy trompette's buzzing bridge

/// String materials: density ρ (kg/m³), Young's modulus E (Pa), visco-elastic loss angle δ, and a
/// frequency-independent floor Q⁻¹. Wound strings use an effective ρ (mass of the winding) and E
/// (stiffness of the core) — that's what makes a wound bass string heavy but not stiff.
#[derive(Clone, Copy)]
struct Material {
    rho: f32,
    e: f32,
    delta: f32,
    q0: f32,
}
pub const MATERIAL_NAMES: [&str; 9] = ["Steel", "Bronze-wound", "Nylon", "Gut", "Silk", "Horsehair", "Polyester (tetron)", "Nylon-wrapped steel", "Brass"];
static MATERIALS: [Material; 9] = [
    Material { rho: 7850.0, e: 2.0e11, delta: 1.5e-4, q0: 2.0e-5 },
    Material { rho: 9000.0, e: 6.0e10, delta: 6.0e-4, q0: 5.0e-5 },
    Material { rho: 1140.0, e: 5.0e9, delta: 2.0e-2, q0: 4.0e-4 },
    Material { rho: 1300.0, e: 6.5e9, delta: 1.6e-2, q0: 5.0e-4 },
    Material { rho: 1340.0, e: 1.0e10, delta: 3.0e-2, q0: 8.0e-4 },
    Material { rho: 1300.0, e: 1.2e9, delta: 3.5e-2, q0: 1.5e-3 },
    Material { rho: 1380.0, e: 1.0e10, delta: 1.2e-2, q0: 3.0e-4 },
    Material { rho: 5500.0, e: 4.0e10, delta: 4.0e-3, q0: 1.0e-4 },
    Material { rho: 8500.0, e: 1.0e11, delta: 3.0e-4, q0: 3.0e-5 },
];
const STEEL: u8 = 0;
const NYLON: u8 = 2;
const GUT: u8 = 3;
const SILK: u8 = 4;
const HAIR: u8 = 5;
const TETRON: u8 = 6;
const NSTEEL: u8 = 7;

const BODY_WOOD: u8 = 0; // wooden soundboard on a box or bowl: plate modes + Helmholtz air
const BODY_SKIN: u8 = 1; // skin belly: membrane Bessel modes + cavity air
const BODY_TUBE: u8 = 2; // bamboo tube: air-column modes + wall modes
const BODY_GOURD: u8 = 3; // a gourd held to the chest: one strong Helmholtz air mode

/// How the body is built. Skin: radius a (m), areal density σ (kg/m²), tension Tₛ (N/m).
/// Wood: plate's lowest mode. Tube: air-column fundamental. `helm`: the cavity's Helmholtz mode.
/// `y0`: the bridge's mean admittance (m/(N·s)) — skins are an order of magnitude more mobile.
#[derive(Clone, Copy)]
struct Body {
    kind: u8,
    a: f32,
    sigma: f32,
    ts: f32,
    plate: f32,
    helm: f32,
    y0: f32,
}
const fn wood(plate: f32, helm: f32, y0: f32) -> Body {
    Body { kind: BODY_WOOD, a: 0.0, sigma: 0.0, ts: 0.0, plate, helm, y0 }
}
const fn skin(a: f32, sigma: f32, ts: f32, helm: f32, y0: f32) -> Body {
    Body { kind: BODY_SKIN, a, sigma, ts, plate: 0.0, helm, y0 }
}

/// One instrument, described physically. Zithers (`opens` empty) give every note its own string,
/// L(note) = len · 2^(−α·(note − ref)/12); necked instruments stop the highest open string at or
/// below the note, L = len · f_open / f.
#[derive(Clone, Copy)]
struct Inst {
    ex: u8,
    mat: u8,
    courses: u8,
    detune: f32, // cents between strings of a course
    stop: u8,
    len: f32,
    reference: f32,
    alpha: f32,
    opens: &'static [f32],
    tension: f32, // N
    jawari: f32,  // curved-bridge radius (m); 0 = a sharp bridge
    soft: f32,    // 0 hard bone/brass jawari … 1 leather thongs
    rattle: u8,
    symp: u8,
    body: Body,
    pos: f32,  // excitation point from the bridge, fraction of the open length
    slap: f32, // how much the bachi / thumb also slaps the skin
    hammer: (f32, f32, f32), // mass kg, K, exponent
    level: f32,
}

const NO_HAMMER: (f32, f32, f32) = (0.0, 0.0, 0.0);

/// The catalog. Order is the TN_INSTRUMENT index — append only (saved patches store the index).
pub const INSTRUMENT_NAMES: [&str; 52] = [
    // East Asia 0–10
    "Guzheng", "Koto", "Pipa", "Erhu", "Yangqin", "Shamisen", "Biwa", "Gayageum", "Haegeum", "Morin khuur", "Đàn bầu",
    // South Asia 11–18
    "Sitar", "Tanpura", "Sarod", "Sarangi", "Saraswati veena", "Santoor", "Esraj", "Dilruba",
    // Middle East & Central Asia 19–29
    "Oud", "Qanun", "Santur", "Kamancheh", "Tar", "Setar", "Bağlama (saz)", "Dutar", "Rubab", "Tanbur", "Rebab",
    // Europe 30–39
    "Bouzouki", "Balalaika", "Hurdy-gurdy", "Nyckelharpa", "Hardanger fiddle", "Kantele", "Cimbalom", "Lute", "Gusle", "Portuguese guitar",
    // Africa 40–51
    "Kora", "Kamale n'goni", "Xalam", "Ekonting", "Krar", "Begena", "Masenqo", "Valiha", "Inanga", "Gimbri", "Goje", "Uhadi",
];

macro_rules! inst {
    ($ex:expr, $mat:expr, $courses:expr, $detune:expr, $stop:expr, $len:expr, $reference:expr, $alpha:expr, $opens:expr, $tension:expr,
     $jawari:expr, $soft:expr, $rattle:expr, $symp:expr, $body:expr, $pos:expr, $slap:expr, $hammer:expr, $level:expr) => {
        Inst {
            ex: $ex, mat: $mat, courses: $courses, detune: $detune, stop: $stop, len: $len, reference: $reference, alpha: $alpha,
            opens: $opens, tension: $tension, jawari: $jawari, soft: $soft, rattle: $rattle, symp: $symp, body: $body,
            pos: $pos, slap: $slap, hammer: $hammer, level: $level,
        }
    };
}

#[rustfmt::skip]
static INSTRUMENTS: [Inst; 52] = [
    // ── East Asia ──
    // Guzheng: 21 nylon-wrapped steel strings on movable bridges, paulownia box; plucked with picks.
    inst!(EX_NAIL, NSTEEL, 1, 0.0, STOP_OPEN, 1.10, 38.0, 0.53, &[], 70.0, 0.0, 0.0, RATTLE_NONE, 0, wood(170.0, 105.0, 2.2e-3), 0.12, 0.0, NO_HAMMER, 2.31),
    // Koto: 13 very taut tetron strings, ivory tsume.
    inst!(EX_NAIL, TETRON, 1, 0.0, STOP_OPEN, 1.20, 50.0, 0.40, &[], 110.0, 0.0, 0.0, RATTLE_NONE, 0, wood(150.0, 95.0, 2.0e-3), 0.10, 0.0, NO_HAMMER, 5.67),
    // Pipa: four strings over high frets, pear-shaped solid-backed body, fingernails (lunzhi tremolo).
    inst!(EX_NAIL, NSTEEL, 1, 0.0, STOP_FRET, 0.66, 0.0, 0.0, &[45.0, 50.0, 52.0, 57.0], 75.0, 0.0, 0.0, RATTLE_NONE, 0, wood(250.0, 180.0, 1.6e-3), 0.12, 0.0, NO_HAMMER, 2.70),
    // Erhu: two steel strings, no fingerboard, python skin on a small hexagonal drum, horsehair bow between the strings.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_AIR, 0.50, 0.0, 0.0, &[62.0, 69.0], 70.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.045, 0.30, 1200.0, 300.0, 1.5e-2), 0.10, 0.0, NO_HAMMER, 1.78),
    // Yangqin: struck trapezoid zither, courses of steel strings, rubber-tipped bamboo beaters.
    inst!(EX_HAMMER, STEEL, 3, 2.0, STOP_OPEN, 0.80, 45.0, 0.45, &[], 80.0, 0.0, 0.0, RATTLE_NONE, 0, wood(200.0, 140.0, 3.0e-3), 0.15, 0.0, (0.003, 3.0e7, 1.8), 0.76),
    // Shamisen: silk strings, fretless neck, cat/dog-skin drum, huge bachi that slaps the skin; sawari on the neck.
    inst!(EX_BACHI, SILK, 1, 0.0, STOP_FRETLESS, 0.80, 0.0, 0.0, &[48.0, 53.0, 60.0], 35.0, 0.60, 0.2, RATTLE_NONE, 0, skin(0.10, 0.25, 3000.0, 260.0, 2.5e-2), 0.10, 0.6, NO_HAMMER, 2.44),
    // Biwa (satsuma): silk on tall frets that buzz (sawari), wooden pear body, bachi.
    inst!(EX_BACHI, SILK, 1, 0.0, STOP_FRET, 0.80, 0.0, 0.0, &[45.0, 52.0, 57.0, 59.0], 30.0, 0.80, 0.3, RATTLE_NONE, 0, wood(180.0, 120.0, 3.0e-3), 0.10, 0.25, NO_HAMMER, 2.29),
    // Gayageum: 12 silk strings, plucked with the flesh; slack strings that bend under the left hand.
    inst!(EX_FINGER, SILK, 1, 0.0, STOP_OPEN, 1.00, 45.0, 0.50, &[], 30.0, 0.0, 0.0, RATTLE_NONE, 0, wood(140.0, 90.0, 2.0e-3), 0.15, 0.0, NO_HAMMER, 2.08),
    // Haegeum: two silk strings, no fingerboard, bamboo-root resonator with a wooden face.
    inst!(EX_BOW, SILK, 1, 0.0, STOP_AIR, 0.45, 0.0, 0.0, &[56.0, 63.0], 40.0, 0.0, 0.0, RATTLE_NONE, 0, wood(450.0, 300.0, 8.0e-3), 0.10, 0.0, NO_HAMMER, 1.48),
    // Morin khuur: two horsehair-bundle strings, trapezoid box, played with the knuckles from the side.
    inst!(EX_BOW, HAIR, 1, 0.0, STOP_AIR, 0.60, 0.0, 0.0, &[46.0, 53.0], 60.0, 0.0, 0.0, RATTLE_NONE, 0, wood(200.0, 130.0, 5.0e-3), 0.12, 0.0, NO_HAMMER, 2.30),
    // Đàn bầu: one steel string played in harmonics; the flexible rod changes its tension.
    inst!(EX_HARMONIC, STEEL, 1, 0.0, STOP_OPEN, 1.00, 48.0, 0.0, &[], 40.0, 0.0, 0.0, RATTLE_NONE, 0, wood(150.0, 100.0, 2.0e-3), 0.08, 0.0, NO_HAMMER, 2.00),
    // ── South Asia ──
    // Sitar: slack steel main string over curved frets, wide bone jawari, 13 tarafs, gourd + teak top, wire mizrab.
    inst!(EX_PLECTRUM, STEEL, 1, 0.0, STOP_FRET, 0.90, 0.0, 0.0, &[41.0], 14.0, 1.00, 0.0, RATTLE_NONE, 13, wood(220.0, 110.0, 4.0e-3), 0.12, 0.0, NO_HAMMER, 0.66),
    // Tanpura: all strings the same length, different gauges; open jawari with the thread.
    inst!(EX_FINGER, STEEL, 1, 0.0, STOP_OPEN, 1.05, 36.0, 0.0, &[], 25.0, 1.20, 0.0, RATTLE_NONE, 0, wood(160.0, 90.0, 3.0e-3), 0.30, 0.0, NO_HAMMER, 1.29),
    // Sarod: fretless steel fingerboard, goatskin belly, coconut-shell jawa, sympathetic strings.
    inst!(EX_PLECTRUM, STEEL, 1, 0.0, STOP_FRETLESS, 0.65, 0.0, 0.0, &[41.0, 48.0], 20.0, 0.0, 0.0, RATTLE_NONE, 13, skin(0.10, 0.20, 1500.0, 150.0, 2.0e-2), 0.08, 0.0, NO_HAMMER, 0.96),
    // Sarangi: three short gut strings stopped by the cuticles, goatskin on a hollowed block, dozens of sympathetics.
    inst!(EX_BOW, GUT, 1, 0.0, STOP_AIR, 0.35, 0.0, 0.0, &[48.0, 55.0, 60.0], 25.0, 0.0, 0.0, RATTLE_NONE, 13, skin(0.08, 0.25, 2000.0, 250.0, 2.0e-2), 0.12, 0.0, NO_HAMMER, 1.02),
    // Saraswati veena: frets on wax, curved brass bridge, jackwood bowl and gourd.
    inst!(EX_FINGER, STEEL, 1, 0.0, STOP_FRET, 0.85, 0.0, 0.0, &[43.0, 48.0, 55.0], 30.0, 0.80, 0.0, RATTLE_NONE, 0, wood(170.0, 100.0, 3.0e-3), 0.18, 0.0, NO_HAMMER, 1.10),
    // Santoor (Kashmir): walnut box, courses of steel strings, light walnut mallets.
    inst!(EX_HAMMER, STEEL, 3, 3.0, STOP_OPEN, 0.55, 50.0, 0.35, &[], 60.0, 0.0, 0.0, RATTLE_NONE, 0, wood(245.0, 160.0, 3.0e-3), 0.15, 0.0, (0.004, 2.0e9, 1.5), 1.48),
    // Esraj: frets, skin belly, sympathetics; bowed.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_FRET, 0.60, 0.0, 0.0, &[48.0, 55.0], 30.0, 0.0, 0.0, RATTLE_NONE, 11, skin(0.08, 0.25, 1800.0, 220.0, 1.5e-2), 0.12, 0.0, NO_HAMMER, 0.75),
    // Dilruba: the esraj's larger cousin, more sympathetics, darker.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_FRET, 0.66, 0.0, 0.0, &[43.0, 50.0], 32.0, 0.0, 0.0, RATTLE_NONE, 13, skin(0.095, 0.28, 1700.0, 190.0, 1.5e-2), 0.12, 0.0, NO_HAMMER, 0.58),
    // ── Middle East & Central Asia ──
    // Oud: fretless, doubled nylon courses, bowl back, thin top with roses, eagle-feather risha.
    inst!(EX_PLECTRUM, NYLON, 2, 2.5, STOP_FRETLESS, 0.61, 0.0, 0.0, &[36.0, 41.0, 45.0, 50.0, 55.0, 60.0], 45.0, 0.0, 0.0, RATTLE_NONE, 0, wood(200.0, 110.0, 3.0e-3), 0.10, 0.0, NO_HAMMER, 2.88),
    // Qanun: triple nylon courses; the bridge stands on fish-skin windows.
    inst!(EX_NAIL, NYLON, 3, 2.0, STOP_OPEN, 0.80, 43.0, 0.48, &[], 40.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.07, 0.15, 1000.0, 150.0, 1.0e-2), 0.12, 0.0, NO_HAMMER, 0.50),
    // Santur (Persian): bare wooden mezrab, courses of four, airier box than the santoor.
    inst!(EX_HAMMER, STEEL, 3, 3.0, STOP_OPEN, 0.50, 50.0, 0.40, &[], 50.0, 0.0, 0.0, RATTLE_NONE, 0, wood(240.0, 170.0, 3.0e-3), 0.15, 0.0, (0.0025, 3.0e9, 1.5), 0.80),
    // Kamancheh: spike fiddle, fretless, spherical bowl with a membrane.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_FRETLESS, 0.34, 0.0, 0.0, &[55.0, 62.0, 69.0, 76.0], 45.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.075, 0.20, 1500.0, 300.0, 1.5e-2), 0.10, 0.0, NO_HAMMER, 0.88),
    // Tar: double-bowl mulberry body with a thin lamb-skin membrane, brass mezrab, doubled courses.
    inst!(EX_PLECTRUM, STEEL, 2, 2.0, STOP_FRET, 0.68, 0.0, 0.0, &[48.0, 55.0, 60.0], 25.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.09, 0.12, 900.0, 200.0, 1.8e-2), 0.08, 0.0, NO_HAMMER, 0.61),
    // Setar: four thin strings, mulberry bowl, played with the index fingernail.
    inst!(EX_NAIL, STEEL, 1, 0.0, STOP_FRET, 0.69, 0.0, 0.0, &[48.0, 55.0, 60.0], 20.0, 0.0, 0.0, RATTLE_NONE, 0, wood(260.0, 170.0, 4.0e-3), 0.20, 0.0, NO_HAMMER, 0.52),
    // Bağlama (saz): long neck, steel triple courses, thin cherry-bark tezene.
    inst!(EX_PLECTRUM, STEEL, 3, 2.0, STOP_FRET, 0.88, 0.0, 0.0, &[50.0, 55.0, 57.0], 15.0, 0.0, 0.0, RATTLE_NONE, 0, wood(220.0, 140.0, 3.0e-3), 0.12, 0.0, NO_HAMMER, 0.26),
    // Dutar: two silk strings, mulberry bowl, strummed with the nails.
    inst!(EX_NAIL, SILK, 1, 0.0, STOP_FRET, 0.85, 0.0, 0.0, &[50.0, 55.0], 18.0, 0.0, 0.0, RATTLE_NONE, 0, wood(200.0, 130.0, 3.0e-3), 0.18, 0.0, NO_HAMMER, 1.00),
    // Rubab (Afghan): gut melody strings, goat-skin lower chamber, many sympathetics.
    inst!(EX_PLECTRUM, GUT, 1, 0.0, STOP_FRET, 0.45, 0.0, 0.0, &[48.0, 55.0, 60.0], 30.0, 0.0, 0.0, RATTLE_NONE, 13, skin(0.08, 0.25, 1800.0, 180.0, 2.0e-2), 0.10, 0.0, NO_HAMMER, 1.47),
    // Tanbur: very long neck, thin steel, slice-built bowl — long, silvery sustain.
    inst!(EX_PLECTRUM, STEEL, 2, 1.5, STOP_FRET, 1.05, 0.0, 0.0, &[45.0, 52.0], 12.0, 0.0, 0.0, RATTLE_NONE, 0, wood(180.0, 110.0, 4.0e-3), 0.10, 0.0, NO_HAMMER, 0.38),
    // Rebab: spike fiddle, horsehair string, skin on a coconut or wooden frame.
    inst!(EX_BOW, HAIR, 1, 0.0, STOP_AIR, 0.45, 0.0, 0.0, &[55.0, 62.0], 35.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.08, 0.30, 1500.0, 220.0, 2.0e-2), 0.12, 0.0, NO_HAMMER, 1.87),
    // ── Europe ──
    // Bouzouki: steel doubled courses, staved bowl, pick.
    inst!(EX_PLECTRUM, STEEL, 2, 1.5, STOP_FRET, 0.68, 0.0, 0.0, &[48.0, 53.0, 57.0, 62.0], 60.0, 0.0, 0.0, RATTLE_NONE, 0, wood(210.0, 140.0, 2.0e-3), 0.12, 0.0, NO_HAMMER, 1.25),
    // Balalaika (prima): triangular body, strummed with the index nail.
    inst!(EX_NAIL, NYLON, 1, 0.0, STOP_FRET, 0.44, 0.0, 0.0, &[64.0, 69.0], 35.0, 0.0, 0.0, RATTLE_NONE, 0, wood(280.0, 220.0, 4.0e-3), 0.25, 0.0, NO_HAMMER, 1.10),
    // Hurdy-gurdy: gut chanterelles stopped by key tangents, rosined wheel, buzzing chien.
    inst!(EX_WHEEL, GUT, 2, 1.0, STOP_TANGENT, 0.33, 0.0, 0.0, &[62.0, 67.0], 40.0, 0.0, 0.0, RATTLE_CHIEN, 0, wood(260.0, 170.0, 3.0e-3), 0.07, 0.0, NO_HAMMER, 0.27),
    // Nyckelharpa: keyed bowed fiddle with a dozen sympathetic strings.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_TANGENT, 0.40, 0.0, 0.0, &[48.0, 55.0, 60.0, 69.0], 40.0, 0.0, 0.0, RATTLE_NONE, 12, wood(260.0, 200.0, 3.0e-3), 0.10, 0.0, NO_HAMMER, 0.88),
    // Hardanger fiddle: violin body, four or five sympathetics under the fingerboard.
    inst!(EX_BOW, STEEL, 1, 0.0, STOP_FRETLESS, 0.33, 0.0, 0.0, &[57.0, 62.0, 69.0, 76.0], 45.0, 0.0, 0.0, RATTLE_NONE, 5, wood(280.0, 270.0, 3.0e-3), 0.10, 0.0, NO_HAMMER, 1.24),
    // Kantele: thin, slack steel strings on a carved box — big amplitude, audible tension glide.
    inst!(EX_FINGER, STEEL, 1, 0.0, STOP_OPEN, 0.55, 55.0, 0.50, &[], 20.0, 0.0, 0.0, RATTLE_NONE, 0, wood(300.0, 220.0, 4.0e-3), 0.20, 0.0, NO_HAMMER, 0.37),
    // Cimbalom: concert hammered dulcimer, cotton-wrapped beaters, big box.
    inst!(EX_HAMMER, STEEL, 3, 1.5, STOP_OPEN, 1.00, 40.0, 0.50, &[], 70.0, 0.0, 0.0, RATTLE_NONE, 0, wood(150.0, 100.0, 2.0e-3), 0.13, 0.0, (0.006, 5.0e8, 2.3), 1.66),
    // Lute (Renaissance): gut double courses, ribbed bowl, rose.
    inst!(EX_FINGER, GUT, 2, 2.0, STOP_FRET, 0.60, 0.0, 0.0, &[43.0, 48.0, 53.0, 57.0, 62.0, 67.0], 30.0, 0.0, 0.0, RATTLE_NONE, 0, wood(190.0, 110.0, 3.5e-3), 0.15, 0.0, NO_HAMMER, 1.09),
    // Gusle: one horsehair string, no fingerboard, skin over a carved bowl.
    inst!(EX_BOW, HAIR, 1, 0.0, STOP_AIR, 0.35, 0.0, 0.0, &[55.0], 30.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.08, 0.20, 1200.0, 260.0, 2.0e-2), 0.12, 0.0, NO_HAMMER, 1.48),
    // Portuguese guitar: steel doubled courses, short scale, fingerpicks — bright and singing.
    inst!(EX_NAIL, STEEL, 2, 1.5, STOP_FRET, 0.44, 0.0, 0.0, &[50.0, 57.0, 59.0, 64.0, 69.0, 71.0], 70.0, 0.0, 0.0, RATTLE_NONE, 0, wood(230.0, 150.0, 2.5e-3), 0.14, 0.0, NO_HAMMER, 1.29),
    // ── Africa ──
    // Kora: 21 nylon strings in two ranks, cowhide over a big calabash with a sound port; optional sesse.
    inst!(EX_FINGER, NYLON, 1, 0.0, STOP_OPEN, 0.95, 41.0, 0.48, &[], 60.0, 0.0, 0.0, RATTLE_SESSE, 0, skin(0.22, 0.60, 2500.0, 90.0, 1.2e-2), 0.25, 0.0, NO_HAMMER, 3.72),
    // Kamale n'goni: harp-lute, calabash and goat skin, metal jingle plate.
    inst!(EX_FINGER, NYLON, 1, 0.0, STOP_OPEN, 0.55, 50.0, 0.50, &[], 40.0, 0.0, 0.0, RATTLE_SESSE, 0, skin(0.13, 0.25, 1800.0, 160.0, 2.0e-2), 0.20, 0.0, NO_HAMMER, 1.53),
    // Xalam / ngoni ba: skin over a carved trough, fretless neck, nail strikes.
    inst!(EX_NAIL, NYLON, 1, 0.0, STOP_FRETLESS, 0.50, 0.0, 0.0, &[50.0, 55.0], 35.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.10, 0.20, 1500.0, 180.0, 2.5e-2), 0.15, 0.2, NO_HAMMER, 1.55),
    // Ekonting: Jola gourd lute, frailed down with the nail — the banjo's ancestor.
    inst!(EX_NAIL, NYLON, 1, 0.0, STOP_FRETLESS, 0.55, 0.0, 0.0, &[55.0, 62.0], 30.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.11, 0.20, 1500.0, 150.0, 2.5e-2), 0.20, 0.3, NO_HAMMER, 1.78),
    // Krar: Ethiopian bowl lyre, skin-covered, strummed with a plectrum.
    inst!(EX_PLECTRUM, NYLON, 1, 0.0, STOP_OPEN, 0.40, 57.0, 0.0, &[], 30.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.12, 0.25, 1500.0, 170.0, 2.0e-2), 0.20, 0.0, NO_HAMMER, 1.02),
    // Begena: great lyre, gut strings buzzing on leather thongs at the bridge.
    inst!(EX_FINGER, GUT, 1, 0.0, STOP_OPEN, 0.70, 40.0, 0.0, &[], 40.0, 1.00, 0.85, RATTLE_NONE, 0, skin(0.18, 0.50, 1800.0, 100.0, 1.5e-2), 0.25, 0.0, NO_HAMMER, 2.77),
    // Masenqo: one horsehair string, diamond skin box.
    inst!(EX_BOW, HAIR, 1, 0.0, STOP_AIR, 0.45, 0.0, 0.0, &[57.0], 30.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.10, 0.30, 1800.0, 200.0, 2.0e-2), 0.12, 0.0, NO_HAMMER, 2.40),
    // Valiha: strings stretched along a bamboo tube.
    inst!(EX_NAIL, STEEL, 1, 0.0, STOP_OPEN, 0.50, 55.0, 0.30, &[], 30.0, 0.0, 0.0, RATTLE_NONE, 0, Body { kind: BODY_TUBE, a: 0.0, sigma: 0.0, ts: 0.0, plate: 171.0, helm: 620.0, y0: 3.0e-3 }, 0.20, 0.0, NO_HAMMER, 0.93),
    // Inanga: one fibre string laced back and forth over a wooden trough.
    inst!(EX_FINGER, GUT, 1, 0.0, STOP_OPEN, 0.75, 43.0, 0.0, &[], 25.0, 0.0, 0.0, RATTLE_NONE, 0, wood(170.0, 120.0, 3.0e-3), 0.20, 0.0, NO_HAMMER, 1.21),
    // Gimbri: camel skin over a log, goat-gut strings, thumb slaps, sersal rattle.
    inst!(EX_FINGER, GUT, 1, 0.0, STOP_FRETLESS, 0.75, 0.0, 0.0, &[38.0, 45.0, 50.0], 25.0, 0.0, 0.0, RATTLE_SERSAL, 0, skin(0.11, 0.50, 2000.0, 110.0, 2.5e-2), 0.15, 0.5, NO_HAMMER, 1.78),
    // Goje: one-string fiddle, calabash with lizard skin.
    inst!(EX_BOW, HAIR, 1, 0.0, STOP_AIR, 0.40, 0.0, 0.0, &[57.0], 30.0, 0.0, 0.0, RATTLE_NONE, 0, skin(0.10, 0.20, 1300.0, 180.0, 2.5e-2), 0.12, 0.0, NO_HAMMER, 2.07),
    // Uhadi: Xhosa musical bow struck with a stick, gourd against the chest selects the overtones.
    inst!(EX_HAMMER, STEEL, 1, 0.0, STOP_FRETLESS, 1.20, 0.0, 0.0, &[43.0], 120.0, 0.0, 0.0, RATTLE_NONE, 0, Body { kind: BODY_GOURD, a: 0.0, sigma: 0.0, ts: 0.0, plate: 900.0, helm: 600.0, y0: 5.0e-3 }, 0.12, 0.0, (0.004, 1.0e9, 1.5), 7.23),
];

pub const NUM_INSTRUMENTS: usize = 52;

/// Sympathetic-string tunings (scale degrees in semitones from the key).
pub const SYMP_SCALE_NAMES: [&str; 9] = ["Yaman", "Bilawal (major)", "Kafi (Dorian)", "Bhairav", "Todi", "Hijaz", "Pentatonic minor", "Chromatic", "Fifths"];
static SYMP_SCALES: [&[u8]; 9] = [
    &[0, 2, 4, 6, 7, 9, 11],
    &[0, 2, 4, 5, 7, 9, 11],
    &[0, 2, 3, 5, 7, 9, 10],
    &[0, 1, 4, 5, 7, 8, 11],
    &[0, 1, 3, 6, 7, 8, 11],
    &[0, 1, 4, 5, 7, 8, 10],
    &[0, 3, 5, 7, 10],
    &[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    &[0, 7],
];

// ── small DSP pieces ────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Default)]
struct Allpass {
    a: f32,
    x1: f32,
    y1: f32,
}
impl Allpass {
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let y = self.a * x + self.x1 - self.a * self.y1;
        self.x1 = x;
        self.y1 = y;
        y
    }
}

/// Band-pass biquad (RBJ, 0 dB at centre) — positive real, so a bank of them is a passive admittance.
#[derive(Clone, Copy, Default)]
struct Bp {
    b0: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}
impl Bp {
    fn new(f: f32, q: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(15.0, sr * 0.45) / sr;
        let alpha = w.sin() / (2.0 * q.max(0.3));
        let a0 = 1.0 + alpha;
        Bp { b0: alpha / a0, b2: -alpha / a0, a1: -2.0 * w.cos() / a0, a2: (1.0 - alpha) / a0, z1: 0.0, z2: 0.0 }
    }
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = -self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

/// Phase delay (samples) of y = g((1−b)x + b·y₁) at ω.
fn onepole_pd(b: f32, w: f32) -> f32 {
    (b * w.sin()).atan2(1.0 - b * w.cos()) / w
}
/// Phase delay (samples) of (a + z⁻¹)/(1 + a z⁻¹) at ω.
fn allpass_pd(a: f32, w: f32) -> f32 {
    let ph = -(w.sin()).atan2(a + w.cos()) + (a * w.sin()).atan2(1.0 + a * w.cos());
    -ph / w
}

#[inline]
fn p01(p: &Params, id: u32) -> f32 {
    p.get(TONOS_BASE + id).clamp(0.0, 1.0)
}
#[inline]
fn pidx(p: &Params, id: u32, n: usize) -> usize {
    (p.get(TONOS_BASE + id).round().max(0.0) as usize).min(n.saturating_sub(1))
}
#[inline]
fn hz_to_midi(f: f32) -> f32 {
    69.0 + 12.0 * (f / 440.0).log2()
}
#[inline]
fn midi_to_hz(n: f32) -> f32 {
    440.0 * 2f32.powf((n - 69.0) / 12.0)
}

// ── string physics ──────────────────────────────────────────────────────────────────────────────

/// The physical string a note is played on.
#[derive(Clone, Copy, Debug, Default)]
pub struct StringSpec {
    pub f: f32,      // sounding fundamental (Hz)
    pub f_loop: f32, // the loop's fundamental (≠ f only for harmonics)
    pub l_open: f32,
    pub l_stop: f32,
    pub t: f32,
    pub mu: f32,
    pub d: f32,  // outer diameter (air drag)
    pub dc: f32, // core diameter (stiffness): smaller than d on a wound string
    pub wound: f32, // total mass / core mass (1 = plain string)
    pub c: f32,
    pub z0: f32,
    pub b: f32, // inharmonicity
    pub harmonic: u32,
}

/// Which string, how long, how tight — for one note on one instrument.
fn string_for(inst: &Inst, mat: &Material, note_hz: f32, tension_scale: f32, harmonic_pick: usize) -> StringSpec {
    let note = hz_to_midi(note_hz);
    let mut t = inst.tension * tension_scale;
    let mut f_loop = note_hz;
    let mut harmonic = 1u32;
    let (l_open, f_open, l_stop) = if inst.ex == EX_HARMONIC {
        // Đàn bầu: one string; pick the harmonic whose rod tension stays nearest rest.
        let f_rest = midi_to_hz(inst.reference);
        let mut best = (2u32, f32::MAX);
        if harmonic_pick >= 1 {
            best = ((harmonic_pick as u32 + 1).clamp(2, 8), 0.0);
        } else {
            for n in 2..=7u32 {
                let r = (note_hz / (n as f32 * f_rest)).ln().abs();
                if r < best.1 {
                    best = (n, r);
                }
            }
        }
        harmonic = best.0;
        f_loop = note_hz / harmonic as f32;
        // Tension that puts the string at f_loop, length fixed: T ∝ f².
        let ratio = f_loop / f_rest;
        t *= ratio * ratio;
        (inst.len, f_loop, inst.len)
    } else if inst.opens.is_empty() {
        let l = (inst.len * 2f32.powf(-inst.alpha * (note - inst.reference) / 12.0)).clamp(0.06, 2.2);
        (l, note_hz, l)
    } else {
        let mut open = inst.opens[0];
        for &o in inst.opens {
            if o <= note + 0.01 {
                open = o;
            }
        }
        let f_open = midi_to_hz(open);
        if note_hz < f_open {
            // Below the lowest open string: the player slackens it.
            let r = note_hz / f_open;
            t *= r * r;
            (inst.len, note_hz, inst.len)
        } else {
            (inst.len, f_open, (inst.len * f_open / note_hz).max(inst.len * 0.05))
        }
    };
    let c = 2.0 * l_open * f_open;
    let mu = t / (c * c);
    let d = (4.0 * mu / (PI * mat.rho)).sqrt();
    let b_plain = PI * PI * PI * mat.e * d.powi(4) / (64.0 * t * l_stop * l_stop);
    // A string that stiff is never made plain: string makers wind it — a thin core carries the
    // tension and stiffness, the winding the mass. Pick the mass ratio that brings B down to what
    // players accept (~3·10⁻⁴), as a G string or an oud bass is built. Horsehair stays a bundle.
    let mut wound = 1.0;
    if mat.e > 2.0e9 && b_plain > 6.0e-4 {
        wound = (b_plain / 3.0e-4).sqrt().clamp(1.0, 8.0);
    }
    let dc = (4.0 * mu / wound / (PI * mat.rho)).sqrt();
    let b = PI * PI * PI * mat.e * dc.powi(4) / (64.0 * t * l_stop * l_stop);
    StringSpec { f: note_hz, f_loop, l_open, l_stop, t, mu, d, dc, wound, c, z0: (t * mu).sqrt(), b, harmonic }
}

/// The string's decay rate σ(f) (1/s): air drag, internal friction, material floor, and the stop.
fn decay_rate(s: &StringSpec, mat: &Material, stop: u8, f: f32, damp_scale: f32) -> f32 {
    let r_air = 2.0 * PI * ETA_AIR + 2.0 * PI * s.d * (PI * ETA_AIR * RHO_AIR * f).sqrt();
    let sig_air = r_air / (2.0 * s.mu);
    let ei = mat.e * PI * s.dc.powi(4) / 64.0;
    // A winding rubs on its core: extra friction on wound strings.
    let wind = 1.0 + 0.6 * (s.wound - 1.0).min(3.0);
    let q_ve = 4.0 * PI * PI * s.mu * ei * mat.delta * wind * f * f / (s.t * s.t);
    let sig_int = PI * f * (q_ve + mat.q0 * wind) * damp_scale;
    // One reflection per round trip at the stopping end.
    let (r0, r1) = match stop {
        STOP_FRET => (0.0008, 0.002),
        STOP_FRETLESS => (0.004, 0.018),
        STOP_AIR => (0.010, 0.035),
        STOP_TANGENT => (0.002, 0.006),
        _ => (0.0, 0.0),
    };
    let refl = (1.0 - r0 - r1 * (f / 1000.0)).clamp(0.5, 1.0);
    let sig_stop = -s.f_loop * refl.ln();
    sig_air + sig_int + sig_stop
}

/// Fit the one-pole loss filter y = g((1−b)x + b·y₁) to the round-trip gains at f₀ and a partial.
fn design_loss(s: &StringSpec, mat: &Material, stop: u8, sr: f32, damp_scale: f32) -> (f32, f32) {
    let f1 = s.f_loop;
    let fh = (f1 * 8.0).min(sr * 0.3).max(f1 * 1.5);
    let g1 = (-decay_rate(s, mat, stop, f1, damp_scale) / f1).exp();
    let gh = (-decay_rate(s, mat, stop, fh, damp_scale) / f1).exp();
    let target = (gh / g1).clamp(0.0, 1.0);
    let (w1, wh) = (TAU * f1 / sr, TAU * fh / sr);
    let ratio = |b: f32| ((1.0 - 2.0 * b * w1.cos() + b * b) / (1.0 - 2.0 * b * wh.cos() + b * b)).sqrt();
    let mut b = 0.0;
    if target < 0.9999 {
        let (mut lo, mut hi) = (0.0f32, 0.95f32);
        if ratio(hi) > target {
            b = hi;
        } else {
            for _ in 0..40 {
                let mid = 0.5 * (lo + hi);
                if ratio(mid) > target {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            b = 0.5 * (lo + hi);
        }
    }
    let g = (g1 * (1.0 - 2.0 * b * w1.cos() + b * b).sqrt() / (1.0 - b)).min(0.99995);
    (g, b)
}

/// Fit the dispersion allpasses: partial n of the loop must sit at n·f₀·√(1+Bn²)/√(1+B).
/// Returns (coefficient, count).
/// `share` caps the allpasses' delay as a fraction of the loop: the filters sit lumped at the bridge,
/// so every sample of delay spent in them is string the bow, hammer or jawari can't touch.
fn design_dispersion(f1: f32, b_inh: f32, period: f32, loss_b: f32, sr: f32, share: f32) -> (f32, usize) {
    if b_inh < 2.0e-6 || period < 12.0 {
        return (0.0, 0);
    }
    let nap = if b_inh > 1.0e-4 { 4usize } else { 2 };
    let mut n = ((sr * 0.18) / f1).floor().clamp(2.0, 6.0);
    while n > 2.0 && n * f1 * (1.0 + b_inh * n * n).sqrt() > sr * 0.4 {
        n -= 1.0;
    }
    let fnn = n * f1 * (1.0 + b_inh * n * n).sqrt() / (1.0 + b_inh).sqrt();
    let target = n * sr / fnn;
    let (w1, wn) = (TAU * f1 / sr, TAU * fnn / sr);
    let d_at_n = |a: f32| -> Option<f32> {
        let ap = nap as f32 * allpass_pd(a, w1);
        let read = period - 1.0 - onepole_pd(loss_b, w1) - ap;
        if read < 2.0 || ap > share * period + nap as f32 {
            return None;
        }
        Some(read + 1.0 + onepole_pd(loss_b, wn) + nap as f32 * allpass_pd(a, wn))
    };
    let f0 = match d_at_n(0.0) {
        Some(d) => d - target,
        None => return (0.0, 0),
    };
    if f0 <= 0.0 {
        return (0.0, 0);
    }
    // Most negative coefficient that still leaves room in the loop.
    let mut a_lo = -0.9f32;
    while a_lo < -0.02 && d_at_n(a_lo).is_none() {
        a_lo += 0.02;
    }
    match d_at_n(a_lo) {
        Some(d) if d - target < 0.0 => {}
        _ => return (a_lo.min(0.0), nap), // can't reach: as much dispersion as fits
    }
    let (mut lo, mut hi) = (a_lo, 0.0f32);
    for _ in 0..40 {
        let mid = 0.5 * (lo + hi);
        match d_at_n(mid) {
            Some(d) if d - target > 0.0 => hi = mid,
            _ => lo = mid,
        }
    }
    (0.5 * (lo + hi), nap)
}

const BUF: usize = 8192; // power of two: ≥ 2 × the longest loop (24 Hz at 96 kHz)
const NLOOP: usize = 3;
const MAX_AP: usize = 4;
const MAX_JAW: usize = 4;
const MAX_MODES: usize = 12;
/// Floors centred at or above this are the ones the GPU deep body replaces.
pub const DEEP_FLOOR_HZ: f32 = 1000.0;
/// The seed a deep note is played with, so the live string matches the one the layer was recorded
/// from sample for sample (vibrato phase, noise). `variant` picks one of two takes.
pub fn deep_seed(note: f32, variant: u32) -> u32 {
    (((note * 16.0).round() as i32 as u32).wrapping_mul(0x9E37_79B1) ^ (0x7D0E_5EED + variant * 7919)) | 1
}

/// One string as a velocity-wave loop. Age a (samples since it left the bridge): a ≤ P/2 is the
/// wave travelling to the nut at distance a; a > P/2 is the returning wave (sign-flipped) at P − a.
/// Point velocity at m: u(m) − u(P−m); slope: −(u(m) + u(P−m))/c.
struct Loop {
    buf: Vec<f32>,
    w: usize,
    read: f32,
    period: f32, // current loop period (samples)
    target: f32, // glide target
    pd: f32,     // filter phase delay at f₀
    g: f32,
    b: f32,
    lp: f32,
    ap: [Allpass; MAX_AP],
    nap: usize,
    yj: [f32; MAX_JAW],
    y_ex: f32,
    ratio: f32, // course detune ratio
}

impl Loop {
    fn new() -> Self {
        Loop {
            buf: vec![0.0; BUF],
            w: 0,
            read: 100.0,
            period: 100.0,
            target: 100.0,
            pd: 0.0,
            g: 0.99,
            b: 0.1,
            lp: 0.0,
            ap: [Allpass::default(); MAX_AP],
            nap: 0,
            yj: [0.0; MAX_JAW],
            y_ex: 0.0,
            ratio: 1.0,
        }
    }
    fn clear(&mut self) {
        for x in self.buf.iter_mut() {
            *x = 0.0;
        }
        self.lp = 0.0;
        for a in self.ap.iter_mut() {
            a.x1 = 0.0;
            a.y1 = 0.0;
        }
        self.yj = [0.0; MAX_JAW];
        self.y_ex = 0.0;
    }
    #[inline]
    fn idx(&self, age: usize) -> usize {
        (self.w.wrapping_sub(1 + age)) & (BUF - 1)
    }
    #[inline]
    fn age(&self, a: usize) -> f32 {
        self.buf[self.idx(a)]
    }
    #[inline]
    fn add(&mut self, a: usize, v: f32) {
        let i = self.idx(a);
        self.buf[i] += v;
    }
    /// Lagrange-interpolated read at fractional age d (d ≥ 1).
    #[inline]
    fn read_at(&self, d: f32) -> f32 {
        let d = d.clamp(1.0, (BUF - 4) as f32);
        let i = d.floor();
        let t = 1.0 + (d - i);
        let i = i as usize;
        let (x0, x1, x2, x3) = (self.age(i - 1), self.age(i), self.age(i + 1), self.age(i + 2));
        let h0 = -(t - 1.0) * (t - 2.0) * (t - 3.0) / 6.0;
        let h1 = t * (t - 2.0) * (t - 3.0) / 2.0;
        let h2 = -t * (t - 1.0) * (t - 3.0) / 2.0;
        let h3 = t * (t - 1.0) * (t - 2.0) / 6.0;
        x0 * h0 + x1 * h1 + x2 * h2 + x3 * h3
    }
    #[inline]
    fn write(&mut self, x: f32) {
        self.buf[self.w] = x;
        self.w = (self.w + 1) & (BUF - 1);
    }
    #[inline]
    fn filter(&mut self, x: f32) -> f32 {
        self.lp = (1.0 - self.b) * x + self.b * self.lp;
        let mut z = self.lp * self.g;
        for a in self.ap[..self.nap].iter_mut() {
            z = a.tick(z);
        }
        z
    }
    /// Incoming point velocity at distance m (integer), and the paired ages.
    #[inline]
    fn point(&self, m: usize) -> (f32, usize, usize) {
        let back = (self.period - m as f32).round().max(m as f32 + 1.0) as usize;
        (self.age(m) - self.age(back), m, back)
    }
    /// Apply a point force as a velocity change Δ to both outgoing waves.
    #[inline]
    fn kick(&mut self, m: usize, back: usize, dv: f32) {
        self.add(m, dv);
        self.add(back, -dv);
    }
    /// ½∫(∂y/∂x)²dx / L, strided over the string (ΔL/L).
    fn strain(&self, c: f32) -> f32 {
        let n = (self.period * 0.5) as usize;
        if n < 4 {
            return 0.0;
        }
        let stride = (n / 48).max(1);
        let mut s = 0.0;
        let mut m = 1;
        while m < n {
            let back = (self.period - m as f32).round() as usize;
            let v = self.age(m) + self.age(back);
            s += v * v;
            m += stride;
        }
        0.5 * s * stride as f32 / (n as f32 * c * c)
    }
}

/// A free rattler sitting on the bridge (or neck head): it leaves its seat when the seat falls
/// faster than its preload lets it follow, flies, and clatters back.
#[derive(Clone, Copy, Default)]
struct Rattle {
    z: f32,
    vz: f32,
    seated: bool,
    xb: f32,
    vb_prev: f32,
    g_eff: f32,
    restitution: f32,
    mass: f32,
}

// ── the voice ───────────────────────────────────────────────────────────────────────────────────

pub struct TonosVoice {
    sr: f32,
    loops: [Loop; NLOOP],
    nloop: usize,
    inst: usize,
    ex: u8,
    spec: StringSpec,
    mat: usize,
    // body
    modes: [Bp; MAX_MODES],
    mode_g: [f32; MAX_MODES],
    mode_l: [f32; MAX_MODES],
    mode_r: [f32; MAX_MODES],
    /// Broad high "floor" modes: they stand in for the dense upper body, which the GPU deep body
    /// renders for real (see `set_deep`). Their bridge admittance stays; only their sound fades.
    mode_floor: [bool; MAX_MODES],
    nmodes: usize,
    // GPU deep body (render-ahead, played from a sample slot by the voice)
    deep: bool,
    deep_env: f32,
    deep_left: u32,
    deep_fade: u32,
    deep_in: [f32; 2],
    /// Bridge force and the floors' (mono) sound on the last sample — what the deep body is
    /// driven with and matched to (`Engine::tonos_excitation`).
    pub last_bridge_force: f32,
    pub last_floor: f32,
    pub last_floor_lr: [f32; 2],
    /// The rest of the body (every non-floor mode, mono) on the last sample: the floors add to it
    /// coherently, so what they contribute is |rest + floors|² − |rest|², not |floors|².
    pub last_rest: f32,
    y0: f32,
    vb: f32,
    pl_prev: f32,
    pr_prev: f32,
    dir_hp: f32,
    dir_x1: f32,
    norm: f32,
    pan_l: f32,
    pan_r: f32,
    // excitation
    m_ex: usize,
    beta: f32,
    amp: f32, // pluck amplitude (m)
    width: f32,
    bow_v: f32,
    bow_f: f32,
    bow_env: f32,
    bow_target: f32,
    mu_s: f32,
    mu_d: f32,
    v0: f32,
    sticking: bool,
    ham_y: f32,
    ham_v: f32,
    ham_m: f32,
    ham_k: f32,
    ham_p: f32,
    ham_on: bool,
    slap_t: u32,
    slap_amp: f32,
    noise_t: u32,
    noise_amp: f32,
    // contacts
    jaw_h: [f32; MAX_JAW],
    njaw: usize,
    jaw_stiff: f32,
    touch_m: usize,
    touch_t: u32,
    mute_z: f32,
    rel_z: f32,
    rel_target: f32,
    // nonlinearity & expression
    ea: f32,
    nl: f32,
    nl_ratio: f32,
    long_force: f32,
    bend: f32,
    vib_depth: f32,
    vib_rate: f32,
    vib_delay: f32,
    vib_phase: f32,
    glide: f32,
    trem_rate: f32,
    trem_phase: f32,
    trem_sign: f32,
    rattle: Rattle,
    rattle_kind: u8,
    rattle_amt: f32,
    clicks: [Bp; 3],
    click_g: f32,
    vel: f32,
    t: u32,
    released: bool,
    level: f32,
    expr: f32,
}

impl TonosVoice {
    pub fn new(sr: f32) -> Self {
        TonosVoice {
            sr,
            loops: [Loop::new(), Loop::new(), Loop::new()],
            nloop: 1,
            inst: 0,
            ex: EX_FINGER,
            spec: StringSpec::default(),
            mat: 0,
            modes: [Bp::default(); MAX_MODES],
            mode_g: [0.0; MAX_MODES],
            mode_l: [0.0; MAX_MODES],
            mode_r: [0.0; MAX_MODES],
            mode_floor: [false; MAX_MODES],
            nmodes: 0,
            deep: false,
            deep_env: 0.0,
            deep_left: 0,
            deep_fade: 1,
            deep_in: [0.0; 2],
            last_bridge_force: 0.0,
            last_floor: 0.0,
            last_floor_lr: [0.0; 2],
            last_rest: 0.0,
            y0: 1e-3,
            vb: 0.0,
            pl_prev: 0.0,
            pr_prev: 0.0,
            dir_hp: 0.0,
            dir_x1: 0.0,
            norm: 1.0,
            pan_l: 1.0,
            pan_r: 1.0,
            m_ex: 4,
            beta: 0.1,
            amp: 0.0,
            width: 2.0,
            bow_v: 0.0,
            bow_f: 0.0,
            bow_env: 0.0,
            bow_target: 0.0,
            mu_s: 0.8,
            mu_d: 0.3,
            v0: 0.1,
            sticking: true,
            ham_y: 0.0,
            ham_v: 0.0,
            ham_m: 0.004,
            ham_k: 1e8,
            ham_p: 2.0,
            ham_on: false,
            slap_t: 0,
            slap_amp: 0.0,
            noise_t: 0,
            noise_amp: 0.0,
            jaw_h: [1.0; MAX_JAW],
            njaw: 0,
            jaw_stiff: 1.0,
            touch_m: 0,
            touch_t: 0,
            mute_z: 0.0,
            rel_z: 0.0,
            rel_target: 0.0,
            ea: 0.0,
            nl: 0.0,
            nl_ratio: 1.0,
            long_force: 0.0,
            bend: 1.0,
            vib_depth: 0.0,
            vib_rate: 5.0,
            vib_delay: 0.3,
            vib_phase: 0.0,
            glide: 1.0,
            trem_rate: 0.0,
            trem_phase: 0.0,
            trem_sign: 1.0,
            rattle: Rattle::default(),
            rattle_kind: RATTLE_NONE,
            rattle_amt: 0.0,
            clicks: [Bp::default(); 3],
            click_g: 0.0,
            vel: 0.0,
            t: 0,
            released: true,
            level: 0.0,
            expr: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr;
    }

    pub fn reset(&mut self) {
        for l in self.loops.iter_mut() {
            l.clear();
        }
        for m in self.modes.iter_mut() {
            m.z1 = 0.0;
            m.z2 = 0.0;
        }
        for c in self.clicks.iter_mut() {
            c.z1 = 0.0;
            c.z2 = 0.0;
        }
        self.vb = 0.0;
        self.deep = false;
        self.deep_env = 0.0;
        self.deep_left = 0;
        self.deep_in = [0.0; 2];
        self.pl_prev = 0.0;
        self.pr_prev = 0.0;
        self.dir_hp = 0.0;
        self.dir_x1 = 0.0;
        self.level = 0.0;
        self.bow_env = 0.0;
        self.ham_on = false;
        self.slap_t = 0;
        self.noise_t = 0;
        self.touch_t = 0;
        self.rel_z = 0.0;
        self.rel_target = 0.0;
        self.long_force = 0.0;
        self.nl_ratio = 1.0;
        self.rattle = Rattle { seated: true, ..Rattle::default() };
        self.released = true;
        self.t = 0;
    }

    /// This note plays a GPU deep body of `frames` samples (fed by `feed_deep` each sample).
    /// Bowed and wheeled strings never do: what the bow does next isn't known in advance.
    pub fn set_deep(&mut self, frames: u32) -> bool {
        if self.is_sustained() || frames < 64 {
            return false;
        }
        self.deep = true;
        self.deep_env = 1.0;
        self.deep_left = frames;
        self.deep_fade = ((self.sr * 0.15) as u32).min(frames / 2).max(1);
        true
    }
    #[inline]
    pub fn feed_deep(&mut self, l: f32, r: f32) {
        self.deep_in = [l, r];
    }
    pub fn deep_active(&self) -> bool {
        self.deep || self.deep_env > 1e-4
    }

    pub fn is_sustained(&self) -> bool {
        matches!(self.ex, EX_BOW | EX_WHEEL)
    }
    pub fn samples(&self) -> u32 {
        self.t
    }
    pub fn is_quiet(&self) -> bool {
        let past = self.t as f32 > self.sr * 0.08;
        if self.is_sustained() && !self.released {
            return false;
        }
        past && self.level < 1.5e-5
    }

    fn build_body(&mut self, b: &Body, size: f32, skin_t: f32, sr: f32) {
        let mut modes: [(f32, f32, f32); MAX_MODES] = [(0.0, 1.0, 0.0); MAX_MODES];
        let mut n = 0;
        let mut push = |f: f32, q: f32, g: f32| {
            if n < MAX_MODES && f > 20.0 && f < sr * 0.45 {
                modes[n] = (f, q, g);
                n += 1;
            }
        };
        let fs = size; // frequency scale from body size
        match b.kind {
            BODY_SKIN => {
                // Circular membrane: f₀₁ = 2.405/(2πa)·√(Tₛ/σ), air-loaded (the lowest mode drops most).
                let f01 = 2.405 / (TAU * b.a) * (b.ts * skin_t / b.sigma).sqrt() * fs;
                const R: [f32; 8] = [1.0, 1.593, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];
                const L: [f32; 8] = [0.82, 0.92, 0.95, 0.97, 0.98, 0.99, 0.99, 1.0];
                for k in 0..8 {
                    push(f01 * R[k] * L[k], 16.0 + 2.0 * k as f32, 1.0 / (1.0 + 0.22 * k as f32));
                }
                push(b.helm * fs, 9.0, 0.55);
                push(f01 * 2.2, 0.9, 0.3);
                push(2600.0, 0.8, 0.30);
            }
            BODY_TUBE => {
                for k in 1..=5 {
                    push(b.plate * k as f32 * fs, 22.0, 1.0 / (k as f32).sqrt());
                }
                push(b.helm * fs, 30.0, 0.5);
                push(b.helm * 1.62 * fs, 30.0, 0.35);
                push(1800.0, 0.8, 0.22);
            }
            BODY_GOURD => {
                push(b.helm * fs, 7.0, 1.0);
                push(b.helm * 2.3 * fs, 9.0, 0.4);
                push(b.plate, 20.0, 0.3);
                push(1500.0, 0.8, 0.18);
            }
            _ => {
                const R: [f32; 7] = [1.0, 1.45, 1.93, 2.55, 3.3, 4.2, 5.4];
                push(b.helm * fs, 12.0, 0.75);
                for k in 0..7 {
                    push(b.plate * R[k] * fs, 25.0 + 2.0 * k as f32, 0.8 / (1.0 + 0.3 * k as f32));
                }
                // Above the first few, plate modes overlap: a broad mid and high floor.
                push(b.plate * 2.6 * fs, 0.9, 0.35);
                push(1800.0, 0.8, 0.3);
            }
        }
        self.nmodes = n;
        for i in 0..n {
            let (f, q, g) = modes[i];
            self.modes[i] = Bp::new(f, q, sr);
            self.mode_g[i] = g;
            self.mode_floor[i] = q < 1.0 && f >= DEEP_FLOOR_HZ;
            // Radiation differs by direction: a deterministic ± spread per mode.
            let s = ((i as f32 * 2.399).sin() * 0.45).clamp(-0.45, 0.45);
            self.mode_l[i] = g * (1.0 - s);
            self.mode_r[i] = g * (1.0 + s);
        }
    }

    fn tune_loop(&mut self, li: usize, period: f32, damp: f32) {
        let mat = &MATERIALS[self.mat];
        let inst = &INSTRUMENTS[self.inst];
        let sr = self.sr;
        let mut s = self.spec;
        s.f_loop = sr / period;
        let (g, b) = design_loss(&s, mat, inst.stop, sr, damp);
        // Bowed strings get no lumped dispersion: friction rounds the Helmholtz corner far more
        // than stiffness does, and delay parked in allpasses at the bridge would move the bow off
        // its place on the string for the low partials — which breaks the stick-slip regime.
        let (a, nap) = if matches!(inst.ex, EX_BOW | EX_WHEEL) { (0.0, 0) } else { design_dispersion(s.f_loop, s.b, period, b, sr, 0.10) };
        let w = TAU / period;
        let l = &mut self.loops[li];
        l.g = g;
        l.b = b;
        l.nap = nap;
        for k in 0..MAX_AP {
            l.ap[k].a = if k < nap { a } else { 0.0 };
        }
        let mut pd = onepole_pd(b, w);
        pd += nap as f32 * allpass_pd(a, w);
        l.pd = pd;
        l.period = period;
        l.target = period;
        l.read = (period - 1.0 - pd).max(1.0);
    }

    /// Release the static shape a point force leaves: triangle apex `amp` at the pluck point,
    /// rounded over the finger/nail/plectrum's contact width — as velocity waves, from rest.
    fn pluck(&mut self, li: usize, amp: f32, m_p: f32, width: f32) {
        let sr = self.sr;
        let l = &mut self.loops[li];
        let n = l.period * 0.5;
        let m_p = m_p.clamp(1.0, n - 1.0);
        let s1 = amp / m_p;
        let s2 = -amp / (n - m_p);
        let w = width.max(0.5);
        let last = (l.read + 3.0) as usize;
        for a in 0..last.min(BUF - 1) {
            let pos = if (a as f32) <= n { a as f32 } else { l.period - a as f32 };
            if pos < 0.0 {
                continue;
            }
            // Smooth the apex: blend slopes across the contact width.
            let t = ((pos - (m_p - 0.5 * w)) / w).clamp(0.0, 1.0);
            let t = t * t * (3.0 - 2.0 * t);
            let slope = s1 + (s2 - s1) * t;
            l.add(a, -0.5 * sr * slope);
        }
        for k in 0..MAX_JAW {
            let m = (k + 1) as f32;
            l.yj[k] += if m < m_p { amp * m / m_p } else { amp * (n - m).max(0.0) / (n - m_p) };
        }
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        self.reset();
        self.released = false;
        let sr = self.sr;
        self.vel = velocity.clamp(0.0, 1.0);
        self.inst = pidx(p, TN_INSTRUMENT, NUM_INSTRUMENTS);
        let inst = INSTRUMENTS[self.inst];
        self.ex = inst.ex;
        let mat_sel = pidx(p, TN_MATERIAL, MATERIALS.len() + 1);
        self.mat = if mat_sel == 0 { inst.mat as usize } else { mat_sel - 1 };
        let mat = MATERIALS[self.mat];
        let tension_scale = 2f32.powf((p01(p, TN_TENSION) - 0.5) * 2.0);
        let harm_pick = pidx(p, TN_HARMONIC, 8);
        let f = note_hz.clamp(20.0, sr * 0.3);
        self.spec = string_for(&inst, &mat, f, tension_scale, harm_pick);
        let s = self.spec;
        let damp = 2f32.powf((p01(p, TN_DAMPING) - 0.5) * 3.0);
        let vel_sens = p01(p, TN_VEL_SENS);
        let v = 1.0 - vel_sens + vel_sens * self.vel;

        // Strings of the course, a few cents apart, each a hair off.
        self.nloop = (inst.courses as usize).clamp(1, NLOOP);
        let spread = inst.detune * 2f32.powf((p01(p, TN_COURSE_DETUNE) - 0.5) * 2.0);
        let base_period = sr / s.f_loop;
        for li in 0..self.nloop {
            let off = if self.nloop > 1 { li as f32 / (self.nloop - 1) as f32 - 0.5 } else { 0.0 };
            let cents = off * spread + rng.bipolar() * 0.25 * (self.nloop > 1) as u8 as f32;
            let ratio = 2f32.powf(cents / 1200.0);
            self.loops[li].ratio = ratio;
            self.tune_loop(li, (base_period / ratio).min((BUF / 2 - 8) as f32), damp);
        }

        // Body: its admittance sets how much the bridge moves; size and skin tension retune it.
        let size = 2f32.powf((0.5 - p01(p, TN_BODY_SIZE)) * 1.5);
        let skin_t = 2f32.powf((p01(p, TN_SKIN_TENSION) - 0.5) * 2.0);
        self.build_body(&inst.body, size, skin_t, sr);
        let gsum: f32 = self.mode_g[..self.nmodes].iter().sum();
        let mut y0 = inst.body.y0 * 4f32.powf(p01(p, TN_BODY) - 0.5);
        // Keep the bridge passive and stable: |2Z₀Y| summed over the course stays well under 1.
        let kmax = 0.45 / (2.0 * s.z0 * gsum.max(0.1) * self.nloop as f32);
        y0 = y0.min(kmax);
        self.y0 = y0;

        // Excitation point: fixed in metres from the bridge (the hand stays put while the other
        // hand stops the string), so stopping shorter moves it relatively toward the middle.
        let beta_open = (inst.pos * 2f32.powf((p01(p, TN_POSITION) - 0.5) * 2.5)).clamp(0.02, 0.45);
        let n_stop = base_period * 0.5;
        let n_open = n_stop * s.l_open / s.l_stop;
        let mut m_ex = (beta_open * n_open).min(0.45 * n_stop).max(1.0);
        if self.ex == EX_HARMONIC {
            // Pluck between the bridge and the node the palm touches.
            m_ex = (n_stop / s.harmonic as f32 * 0.5).max(1.0);
            self.touch_m = (n_stop / s.harmonic as f32).round().max(1.0) as usize;
            self.touch_t = (sr * 0.05) as u32;
        }
        self.m_ex = m_ex.round() as usize;
        self.beta = m_ex / n_stop;

        // Jawari: contact points on a curved bridge h(x) = x²/2R + lift (lift = the thread).
        let jaw = p01(p, TN_JAWARI);
        self.njaw = 0;
        if inst.jawari > 0.0 && jaw > 0.001 {
            let dx = s.c / sr;
            let contact = 0.020;
            self.njaw = ((contact / dx).ceil() as usize).clamp(1, MAX_JAW);
            let lift = (1.0 - jaw) * 6.0e-4;
            for k in 0..self.njaw {
                let x = (k + 1) as f32 * dx;
                self.jaw_h[k] = x * x / (2.0 * inst.jawari) + lift;
            }
            self.jaw_stiff = 1.0 - 0.75 * inst.soft;
        }

        // Tension modulation: EA/T₀ (cross-section from the diameter), scaled 0..2× physical.
        self.ea = mat.e * PI * s.dc * s.dc * 0.25;
        self.nl = p01(p, TN_NONLIN) * 2.0;

        // Hand & expression.
        self.mute_z = p01(p, TN_MUTE) * 1.5;
        self.rel_target = p01(p, TN_RELEASE_DAMP) * 2.5;
        self.vib_depth = p01(p, TN_VIB_DEPTH) * 45.0; // cents
        self.vib_rate = 3.5 + p01(p, TN_VIB_RATE) * 4.5;
        self.vib_delay = 0.15 + 0.6 * (1.0 - p01(p, TN_VIB_DEPTH));
        self.vib_phase = rng.next_f32() * TAU;
        let slide = p01(p, TN_SLIDE);
        self.glide = if slide < 0.005 { 1.0 } else { 1.0 - (-1.0 / (sr * (0.01 + 0.4 * slide * slide))).exp() };
        let trem = p01(p, TN_TREMOLO);
        self.trem_rate = if trem < 0.01 { 0.0 } else { 4.0 + trem * 12.0 };
        self.trem_phase = 0.0;
        self.trem_sign = 1.0;
        let width = p01(p, TN_WIDTH);
        let pan = ((hz_to_midi(f) - 60.0) / 36.0).clamp(-1.0, 1.0) * width * 0.6;
        self.pan_l = (1.0 - pan).sqrt();
        self.pan_r = (1.0 + pan).sqrt();

        // Rattle (sesse, sersal, chien): the preload sets how easily it lifts off.
        self.rattle_kind = inst.rattle;
        self.rattle_amt = if inst.rattle == RATTLE_NONE { 0.0 } else { p01(p, TN_RATTLE) };
        if self.rattle_amt > 0.001 {
            let (fs, q): ([f32; 3], f32) = match inst.rattle {
                RATTLE_CHIEN => ([950.0, 1900.0, 3300.0], 10.0),
                RATTLE_SERSAL => ([1900.0, 3100.0, 5200.0], 35.0),
                _ => ([2800.0, 4100.0, 6300.0], 40.0),
            };
            for k in 0..3 {
                self.clicks[k] = Bp::new(fs[k], q, sr);
            }
            // g_eff: 0.2 g (loose, buzzes on everything) … 6 g (tight, only on hard notes).
            self.rattle.g_eff = 9.81 * (0.2 + 6.0 * (1.0 - self.rattle_amt).powi(2));
            self.rattle.restitution = 0.35;
            self.rattle.mass = 0.004;
            self.rattle.seated = true;
            self.click_g = 1.0;
        }

        // Output scale: the radiated level of a nominal pluck, so instruments sit at similar levels.
        self.norm = inst.level * 0.3 / (self.y0 * s.t * 0.05).max(1e-9);

        // Excite.
        let hard = p01(p, TN_HARDNESS);
        let force = p01(p, TN_FORCE);
        let dx = s.c / sr;
        match self.ex {
            EX_BOW | EX_WHEEL => {
                self.mu_s = 0.6 + 0.4 * hard;
                self.mu_d = 0.25 + 0.1 * hard;
                self.v0 = 0.1;
                let speed = p01(p, TN_BOW_SPEED);
                self.bow_v = if self.ex == EX_WHEEL { 0.25 + 0.35 * speed } else { (0.05 + 0.25 * speed) * (0.6 + 0.4 * v) };
                // Inside Schelleng's window: F_max = 2Z₀v_b / (β(μs − μd)).
                let fmax = 2.0 * s.z0 * self.bow_v / (self.beta.max(0.03) * (self.mu_s - self.mu_d));
                self.bow_f = fmax * (0.12 + 0.55 * force) * (0.7 + 0.3 * v);
                self.bow_target = 1.0;
                self.bow_env = 0.0;
                self.sticking = true;
            }
            EX_HAMMER => {
                let (m, k, pe) = inst.hammer;
                self.ham_m = m * (0.6 + 0.8 * force);
                self.ham_k = k * 4f32.powf((hard - 0.5) * 2.0);
                self.ham_p = pe;
                // The player's balance: a light treble string moves far more under the same hammer, so
                // players strike it more gently — speed scaled by impedance against the reference string.
                let r = string_for(&inst, &mat, midi_to_hz(inst.reference.max(36.0) + 7.0), tension_scale, 0);
                let balance = ((s.z0 / r.z0) * (r.f / f).sqrt()).clamp(0.2, 2.0);
                self.ham_v = ((0.4 + 4.0 * v.powf(1.3)) * balance).max(0.05);
                // No player drives a string further than a few millimetres: the hammer's momentum
                // spread over the string's two impedances, m·v/(2Z₀), stays under ~0.6% of its length.
                let vmax = 0.006 * s.l_stop * 2.0 * s.z0 * self.nloop as f32 / self.ham_m;
                self.ham_v = self.ham_v.min(vmax);
                self.ham_y = -1.0e-4; // just short of the string
                self.ham_on = true;
            }
            _ => {
                // Static deflection under the pluck force: A = F·β(1−β)·L/T.
                let fp = (0.15 + 1.4 * force) * (0.15 + 0.85 * v.powf(1.4));
                let amp = (fp * self.beta * (1.0 - self.beta) * s.l_stop / s.t).min(0.012 * s.l_stop.max(0.2));
                let contact = match self.ex {
                    EX_FINGER => 0.012,
                    EX_NAIL => 0.004,
                    EX_PLECTRUM => 0.0025,
                    EX_BACHI => 0.006,
                    _ => 0.008,
                } * (1.5 - hard);
                self.width = (contact / dx).max(0.5);
                let sign = if rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
                self.amp = amp * sign;
                let w = self.width;
                for li in 0..self.nloop {
                    self.pluck(li, self.amp, m_ex, w);
                }
                // The nail / plectrum scraping off, and the bachi or thumb slapping the skin.
                if matches!(self.ex, EX_NAIL | EX_PLECTRUM | EX_BACHI) {
                    self.noise_t = (sr * 0.004) as u32;
                    self.noise_amp = amp.abs() * sr * 0.02 * (0.3 + hard);
                }
                if inst.slap > 0.0 {
                    self.slap_t = (sr * 0.0015) as u32;
                    self.slap_amp = inst.slap * fp * 3.0;
                }
            }
        }
        self.t = 0;
    }

    /// Legato: slide the stopping finger (or bend the rod) to a new note without a new attack.
    pub fn slur(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        if self.released || self.t == 0 {
            self.trigger(note_hz, velocity, p, rng);
            return;
        }
        let inst = INSTRUMENTS[self.inst];
        let mat = MATERIALS[self.mat];
        let tension_scale = 2f32.powf((p01(p, TN_TENSION) - 0.5) * 2.0);
        let s = string_for(&inst, &mat, note_hz.clamp(20.0, self.sr * 0.3), tension_scale, pidx(p, TN_HARMONIC, 8));
        // Same string? Glide its length. (A different open string would be a new pluck.)
        let same = (s.l_open - self.spec.l_open).abs() < 1e-4 && (s.t - self.spec.t).abs() < 0.5;
        if !same && !self.is_sustained() {
            self.trigger(note_hz, velocity, p, rng);
            return;
        }
        self.spec = s;
        self.deep = false; // the recorded layer is of the first note, not this one
        let base = self.sr / s.f_loop;
        for li in 0..self.nloop {
            let r = self.loops[li].ratio;
            self.loops[li].target = (base / r).min((BUF / 2 - 8) as f32);
        }
        // A hammer-on / slide on a plucked string adds a little energy where the finger lands.
        if !self.is_sustained() {
            let a = self.amp * 0.25;
            let m = self.m_ex as f32;
            let w = self.width;
            for li in 0..self.nloop {
                self.pluck(li, a, m, w);
            }
        }
        self.vel = velocity.clamp(0.0, 1.0);
    }

    pub fn release(&mut self) {
        if !self.released {
            self.released = true;
            self.bow_target = 0.0;
        }
    }

    #[inline]
    fn dashpot(l: &mut Loop, m: usize, zeta: f32) {
        if zeta <= 0.0 {
            return;
        }
        let (v, a, b) = l.point(m);
        l.kick(a, b, -v * zeta / (1.0 + zeta));
    }

    /// One stereo sample. `bend` is a frequency ratio (it changes tension / stopped length).
    pub fn render_sample(&mut self, bend: f32, mod_wheel: f32, rng: &mut Rng) -> (f32, f32) {
        let sr = self.sr;
        let dt = 1.0 / sr;
        let s = self.spec;
        let tsec = self.t as f32 * dt;
        self.expr += (mod_wheel - self.expr) * 0.002;

        // Pitch: bend + vibrato (more with the mod wheel) + tension modulation.
        let vib_amt = (tsec - self.vib_delay).clamp(0.0, 0.4) / 0.4;
        self.vib_phase += TAU * self.vib_rate * dt;
        if self.vib_phase > TAU {
            self.vib_phase -= TAU;
        }
        let vib_c = (self.vib_depth * vib_amt + 30.0 * self.expr) * self.vib_phase.sin();
        let vib = 2f32.powf(vib_c / 1200.0);
        self.bend += (bend - self.bend) * 0.01;
        if self.t % 16 == 0 && self.nl > 0.0 {
            let strain = self.loops[0].strain(s.c);
            let dt_n = self.ea * strain * self.nl; // ΔT (N)
            self.long_force = dt_n * 0.15;
            self.nl_ratio = (1.0 + dt_n / s.t).sqrt();
        }
        let pitch = self.bend * vib * self.nl_ratio;
        for li in 0..self.nloop {
            let l = &mut self.loops[li];
            l.period += (l.target - l.period) * self.glide;
            l.read = (l.period / pitch - 1.0 - l.pd).clamp(1.0, (BUF - 8) as f32);
        }

        // 1. Waves arriving at the bridge → bridge force.
        let mut xin = [0.0f32; NLOOP];
        let mut fsum = 0.0;
        for li in 0..self.nloop {
            xin[li] = self.loops[li].read_at(self.loops[li].read);
            fsum += xin[li];
        }
        let mut fb = -2.0 * s.z0 * fsum + self.long_force;
        if self.slap_t > 0 {
            let k = self.slap_t as f32 / (sr * 0.0015);
            fb += self.slap_amp * (PI * k).sin();
            self.slap_t -= 1;
        }

        // 2. Body: modal admittance → bridge velocity (fed back) and radiation.
        let mut vsum = 0.0;
        let mut pl = 0.0;
        let mut pr = 0.0;
        let mut fl = 0.0;
        let mut fr = 0.0;
        let mut floor = 0.0;
        let mut rest = 0.0;
        for k in 0..self.nmodes {
            let o = self.modes[k].tick(fb);
            vsum += o * self.mode_g[k];
            if self.mode_floor[k] {
                floor += o * self.mode_g[k];
                fl += o * self.mode_l[k];
                fr += o * self.mode_r[k];
            } else {
                rest += o * self.mode_g[k];
                pl += o * self.mode_l[k];
                pr += o * self.mode_r[k];
            }
        }
        self.last_bridge_force = fb;
        self.last_floor = floor;
        self.last_floor_lr = [fl, fr];
        self.last_rest = rest;
        // Deep body: the GPU layer replaces the floors while the note is the one it was recorded
        // from. A bend, the mod wheel, a slur or the release hand it back to the floors (30 ms).
        if self.deep {
            let off = self.released || (bend - 1.0).abs() > 1e-4 || mod_wheel > 0.01;
            if off {
                self.deep = false;
            }
        }
        let target = if self.deep { (self.deep_left as f32 / self.deep_fade as f32).min(1.0) } else { 0.0 };
        self.deep_env += (target - self.deep_env) * (1.0 / (sr * 0.03)).min(1.0);
        if self.deep_left > 0 {
            self.deep_left -= 1;
        }
        let keep = 1.0 - self.deep_env;
        pl += fl * keep + self.deep_in[0] * self.deep_env;
        pr += fr * keep + self.deep_in[1] * self.deep_env;
        let vb = self.y0 * vsum;

        // Rattle on the bridge.
        let mut click = 0.0;
        if self.rattle_amt > 0.001 {
            let r = &mut self.rattle;
            let ab = (vb - r.vb_prev) * sr;
            r.vb_prev = vb;
            r.xb = r.xb * 0.9995 + vb * dt;
            if r.seated {
                r.z = r.xb;
                r.vz = vb;
                if ab < -r.g_eff {
                    r.seated = false;
                }
            } else {
                r.vz -= r.g_eff * dt;
                r.z += r.vz * dt;
                if r.z <= r.xb {
                    let vrel = r.vz - vb;
                    click = (-vrel).max(0.0) * r.mass * sr;
                    r.z = r.xb;
                    r.vz = vb - r.restitution * vrel;
                    if vrel.abs() < 2.0e-4 {
                        r.seated = true;
                    }
                }
            }
        }

        // 3. Reflect: loss + dispersion, plus the moving bridge.
        for li in 0..self.nloop {
            let l = &mut self.loops[li];
            let y = l.filter(xin[li]) + vb;
            l.write(y);
        }

        // 4. Contacts and excitation along the string.
        let n_half = (self.loops[0].period * 0.5) as usize;
        let m_ex = self.m_ex.min(n_half.saturating_sub(1)).max(1);
        match self.ex {
            EX_BOW | EX_WHEEL => {
                let rate = if self.bow_target > self.bow_env { 1.0 / (sr * 0.015) } else { 1.0 / (sr * 0.04) };
                self.bow_env += (self.bow_target - self.bow_env).clamp(-rate, rate);
                let mut vb_bow = self.bow_v * (0.85 + 0.3 * self.expr) * (1.0 + 0.01 * rng.bipolar());
                if self.ex == EX_WHEEL && self.trem_rate > 0.0 {
                    // The coup de poignet: the wrist pulses the wheel.
                    self.trem_phase += self.trem_rate * dt;
                    if self.trem_phase >= 1.0 {
                        self.trem_phase -= 1.0;
                    }
                    vb_bow *= 1.0 + 0.9 * (-(self.trem_phase * 9.0)).exp();
                }
                // Players dig in at the start of a stroke so the Helmholtz motion catches at once.
                let dig = 1.0 + 1.2 * (-tsec / 0.07).exp();
                let fnorm = self.bow_f * self.bow_env * dig * (0.8 + 0.4 * self.expr);
                if fnorm > 1e-6 {
                    let k = fnorm / (2.0 * s.z0);
                    for li in 0..self.nloop {
                        let l = &mut self.loops[li];
                        let (vh, a, b) = l.point(m_ex);
                        let rel = vh - vb_bow;
                        let v = if rel.abs() <= self.mu_s * k {
                            vb_bow // sticking
                        } else {
                            // Slipping: X² + bX + c = 0, X = |v − v_bow|.
                            let sgn = rel.signum();
                            let aa = rel.abs();
                            let bq = self.v0 - aa + k * self.mu_d;
                            let cq = self.v0 * (k * self.mu_s - aa);
                            let x = (-bq + (bq * bq - 4.0 * cq).max(0.0).sqrt()) * 0.5;
                            vb_bow + sgn * x.max(0.0)
                        };
                        l.kick(a, b, v - vh);
                    }
                }
            }
            EX_HAMMER if self.ham_on => {
                let subs = 8;
                let dts = dt / subs as f32;
                let mut favg = 0.0;
                let l0 = &self.loops[0];
                let (vin, _, _) = l0.point(m_ex);
                let mut ys = l0.y_ex;
                for _ in 0..subs {
                    let delta = self.ham_y - ys;
                    let f = if delta > 0.0 { self.ham_k * delta.powf(self.ham_p) } else { 0.0 };
                    let vs = vin + f / (2.0 * s.z0 * self.nloop as f32);
                    ys += vs * dts;
                    self.ham_v -= f / self.ham_m * dts;
                    self.ham_y += self.ham_v * dts;
                    favg += f;
                }
                favg /= subs as f32;
                for li in 0..self.nloop {
                    let l = &mut self.loops[li];
                    let (vh, a, b) = l.point(m_ex);
                    let dv = favg / (2.0 * s.z0 * self.nloop as f32);
                    l.kick(a, b, dv);
                    l.y_ex += (vh + dv) * dt;
                }
                if self.ham_v < 0.0 && self.ham_y < self.loops[0].y_ex - 2.0e-4 {
                    self.ham_on = false; // rebounded clear
                }
                if self.t as f32 > sr * 0.03 {
                    self.ham_on = false;
                }
            }
            _ => {
                if self.noise_t > 0 {
                    let a = self.noise_amp * rng.bipolar() * (self.noise_t as f32 / (sr * 0.004));
                    for li in 0..self.nloop {
                        let l = &mut self.loops[li];
                        let (_, ia, ib) = l.point(m_ex);
                        l.kick(ia, ib, a);
                    }
                    self.noise_t -= 1;
                }
                // Tremolo picking: re-pluck while held.
                if self.trem_rate > 0.0 && !self.released && matches!(self.ex, EX_FINGER | EX_NAIL | EX_PLECTRUM | EX_BACHI) {
                    self.trem_phase += self.trem_rate * dt;
                    if self.trem_phase >= 1.0 {
                        self.trem_phase -= 1.0;
                        self.trem_sign = -self.trem_sign;
                        let a = self.amp * 0.55 * self.trem_sign;
                        let w = self.width;
                        for li in 0..self.nloop {
                            self.pluck(li, a, m_ex as f32, w);
                        }
                    }
                }
            }
        }

        // Jawari: the string wraps onto the curved bridge — a unilateral constraint at each point.
        if self.njaw > 0 {
            for li in 0..self.nloop {
                let l = &mut self.loops[li];
                for k in 0..self.njaw {
                    let m = k + 1;
                    let (vh, a, b) = l.point(m);
                    let y_next = l.yj[k] + vh * dt;
                    let h = self.jaw_h[k];
                    let mut v = vh;
                    if y_next < -h {
                        let v_req = (-h - l.yj[k]) * sr;
                        let dv = (v_req - vh) * self.jaw_stiff;
                        l.kick(a, b, dv);
                        v = vh + dv;
                    }
                    l.yj[k] = (l.yj[k] + v * dt) * 0.9997;
                }
            }
        }

        // Đàn bầu: the palm on the node, then lifted.
        if self.touch_t > 0 {
            let m = self.touch_m.min(n_half.saturating_sub(1)).max(1);
            for li in 0..self.nloop {
                Self::dashpot(&mut self.loops[li], m, 1.2);
            }
            self.touch_t -= 1;
        }
        // Palm mute near the bridge; the hand damping the string after release.
        if self.mute_z > 0.0 {
            let m = ((n_half as f32) * 0.06).max(1.0) as usize;
            for li in 0..self.nloop {
                Self::dashpot(&mut self.loops[li], m, self.mute_z * 0.15);
            }
        }
        if self.released {
            let ready = !self.is_sustained() || self.bow_env < 0.05;
            if ready {
                self.rel_z += (self.rel_target - self.rel_z) * (1.0 / (sr * 0.03));
                let m = ((n_half as f32) * 0.8).max(1.0) as usize;
                for li in 0..self.nloop {
                    Self::dashpot(&mut self.loops[li], m, self.rel_z * 0.12);
                }
            }
        }

        // 5. Radiation: the body's acceleration (d/dt of its velocity), plus a little string.
        let norm_d = sr / (TAU * 400.0);
        let mut yl = (pl - self.pl_prev) * norm_d * self.y0;
        let mut yr = (pr - self.pr_prev) * norm_d * self.y0;
        self.pl_prev = pl;
        self.pr_prev = pr;
        // Direct: a high-passed share of the bridge force (strings radiate the highs a little).
        self.dir_hp = 0.97 * (self.dir_hp + fb - self.dir_x1);
        self.dir_x1 = fb;
        let direct = self.dir_hp * self.y0 * 0.12;
        if click > 0.0 {
            let mut c = 0.0;
            for k in 0..3 {
                c += self.clicks[k].tick(click) * (1.0 - 0.25 * k as f32);
            }
            let cc = c * self.click_g * self.y0 * 0.6 * self.rattle_amt;
            yl += cc;
            yr += cc;
        } else if self.rattle_amt > 0.001 {
            let mut c = 0.0;
            for k in 0..3 {
                c += self.clicks[k].tick(0.0) * (1.0 - 0.25 * k as f32);
            }
            let cc = c * self.click_g * self.y0 * 0.6 * self.rattle_amt;
            yl += cc;
            yr += cc;
        }
        let ol = (yl + direct) * self.norm * self.pan_l;
        let or = (yr + direct) * self.norm * self.pan_r;
        let a = ol.abs().max(or.abs());
        self.level = if a > self.level { a } else { self.level * 0.9995 };
        self.t = self.t.wrapping_add(1);
        if !ol.is_finite() || !or.is_finite() {
            self.reset();
            return (0.0, 0.0);
        }
        (ol.clamp(-4.0, 4.0), or.clamp(-4.0, 4.0))
    }
}

// ── sympathetic strings ─────────────────────────────────────────────────────────────────────────

const MAX_SYMP: usize = 13;

struct Symp {
    buf: Vec<f32>,
    w: usize,
    read: f32,
    g: f32,
    b: f32,
    lp: f32,
    gl: f32,
    gr: f32,
}
impl Symp {
    fn new() -> Self {
        Symp { buf: vec![0.0; 4096], w: 0, read: 100.0, g: 0.999, b: 0.2, lp: 0.0, gl: 1.0, gr: 1.0 }
    }
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let mask = self.buf.len() - 1;
        let d = self.read.clamp(1.0, (mask - 2) as f32);
        let i = d.floor() as usize;
        let fr = d - i as f32;
        let a = self.buf[(self.w.wrapping_sub(1 + i)) & mask];
        let b = self.buf[(self.w.wrapping_sub(2 + i)) & mask];
        let y = a + (b - a) * fr;
        self.lp = (1.0 - self.b) * y + self.b * self.lp;
        self.buf[self.w] = self.lp * self.g + x;
        self.w = (self.w + 1) & mask;
        y
    }
}

/// The sympathetic strings: tuned to a raga / maqam / scale, never plucked, ringing with whatever
/// the played strings put into the bridge.
pub struct TonosRack {
    strings: Vec<Symp>,
    n: usize,
    sr: f32,
    key: (usize, usize, usize, usize, u32), // (inst, key, scale, count, tension bits) last tuned
    hp_x1: f32,
    hp_y1: f32,
}

impl TonosRack {
    pub fn new(sr: f32) -> Self {
        TonosRack { strings: (0..MAX_SYMP).map(|_| Symp::new()).collect(), n: 0, sr, key: (usize::MAX, 0, 0, 0, 0), hp_x1: 0.0, hp_y1: 0.0 }
    }

    pub fn active(p: &Params) -> bool {
        p.get(TONOS_BASE + TN_ENABLE) > 0.5 && p.get(TONOS_BASE + TN_SYMP) > 0.001
    }

    fn retune(&mut self, p: &Params) {
        let inst = pidx(p, TN_INSTRUMENT, NUM_INSTRUMENTS);
        let key = pidx(p, TN_SYMP_KEY, 12);
        let scale = pidx(p, TN_SYMP_SCALE, SYMP_SCALES.len());
        let count = match INSTRUMENTS[inst].symp as usize {
            0 => 9,
            c => c.min(MAX_SYMP),
        };
        let stamp = (inst, key, scale, count, p.get(TONOS_BASE + TN_DAMPING).to_bits());
        if stamp == self.key {
            return;
        }
        self.key = stamp;
        self.n = count;
        let degrees = SYMP_SCALES[scale];
        let damp = 2f32.powf((p01(p, TN_DAMPING) - 0.5) * 3.0);
        let mat = MATERIALS[STEEL as usize];
        for i in 0..count {
            let oct = i / degrees.len();
            let note = 60.0 + key as f32 + degrees[i % degrees.len()] as f32 + 12.0 * oct as f32;
            let f = midi_to_hz(note).min(self.sr * 0.2);
            // Thin steel taraf, ~0.6 m, light tension.
            let l = 0.6 * 2f32.powf(-(note - 60.0) / 24.0);
            let t = 12.0;
            let c = 2.0 * l * f;
            let mu = t / (c * c);
            let d = (4.0 * mu / (PI * mat.rho)).sqrt();
            let spec = StringSpec { f, f_loop: f, l_open: l, l_stop: l, t, mu, d, dc: d, wound: 1.0, c, z0: (t * mu).sqrt(), b: 0.0, harmonic: 1 };
            let (g, b) = design_loss(&spec, &mat, STOP_OPEN, self.sr, damp);
            let period = self.sr / f;
            let s = &mut self.strings[i];
            s.g = (g * 0.9995).min(0.9997); // they also lose to the bridge they share
            s.b = b;
            s.read = (period - 1.0 - onepole_pd(b, TAU / period)).max(1.0);
            let pan = (i as f32 / count.max(1) as f32 - 0.5) * 0.8;
            s.gl = 1.0 - pan;
            s.gr = 1.0 + pan;
        }
    }

    pub fn process(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params) {
        self.retune(p);
        let level = p01(p, TN_SYMP);
        let drive = 0.03 * level;
        let wet = 1.6 * level;
        for f in 0..frames {
            let x = if nch >= 2 { 0.5 * (out[0][f] + out[1][f]) } else { out[0][f] };
            // DC-blocked drive.
            let hp = 0.995 * (self.hp_y1 + x - self.hp_x1);
            self.hp_x1 = x;
            self.hp_y1 = hp;
            let (mut l, mut r) = (0.0, 0.0);
            for s in self.strings[..self.n].iter_mut() {
                let y = s.tick(hp * drive);
                l += y * s.gl;
                r += y * s.gr;
            }
            if !l.is_finite() || !r.is_finite() {
                for s in self.strings.iter_mut() {
                    for v in s.buf.iter_mut() {
                        *v = 0.0;
                    }
                }
                continue;
            }
            if nch >= 2 {
                out[0][f] += l * wet;
                out[1][f] += r * wet;
            } else if nch == 1 {
                out[0][f] += 0.5 * (l + r) * wet;
            }
        }
    }
}

// ── tests ───────────────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48000.0;

    /// The deep body path: a deep note replays the recorded string exactly, so feeding it back the
    /// floors it replaces reproduces the plain note bit for bit; feeding silence removes only the
    /// floors; a bend or the release hands the sound back to the floors.
    #[test]
    fn tonos_deep_body_replays_the_recorded_string() {
        for inst in [19usize, 11, 47, 0, 40, 16] {
            let p = params(inst);
            let note = 57.0;
            let seed = deep_seed(note, 1);
            let n = (SR * 0.6) as usize;
            // Plain note from the deep seed, recording the floors and the bridge force.
            let mut a = TonosVoice::new(SR);
            let mut ra = Rng(seed);
            a.trigger(midi_to_hz(note), 0.7, &p, &mut ra);
            let mut plain = Vec::with_capacity(n);
            let mut floors = Vec::with_capacity(n);
            let mut force = Vec::with_capacity(n);
            for _ in 0..n {
                plain.push(a.render_sample(1.0, 0.0, &mut ra));
                floors.push(a.last_floor_lr);
                force.push(a.last_bridge_force);
            }
            // Deep note fed those floors: identical.
            let mut b = TonosVoice::new(SR);
            let mut rb = Rng(seed);
            b.trigger(midi_to_hz(note), 0.7, &p, &mut rb);
            assert!(b.set_deep(n as u32 + 48000), "{inst} takes a deep body");
            let mut worst = 0.0f32;
            for i in 0..n {
                b.feed_deep(floors[i][0], floors[i][1]);
                let o = b.render_sample(1.0, 0.0, &mut rb);
                assert_eq!(b.last_bridge_force, force[i], "{inst} drive diverged at {i}");
                worst = worst.max((o.0 - plain[i].0).abs()).max((o.1 - plain[i].1).abs());
            }
            assert!(worst < 1e-6, "{inst}: deep replay differs by {worst}");
            // Deep note fed silence: the floors are gone, the rest is the same string.
            let mut c = TonosVoice::new(SR);
            let mut rc = Rng(seed);
            c.trigger(midi_to_hz(note), 0.7, &p, &mut rc);
            c.set_deep(n as u32 + 48000);
            let (mut e_plain, mut e_diff) = (0.0f64, 0.0f64);
            for i in 0..n {
                let o = c.render_sample(1.0, 0.0, &mut rc);
                assert_eq!(c.last_bridge_force, force[i]);
                e_plain += (plain[i].0 as f64).powi(2);
                e_diff += ((o.0 - plain[i].0) as f64).powi(2);
            }
            assert!(e_diff > 0.0 && e_diff < e_plain, "{inst}: floors share {}", e_diff / e_plain);
            // A bend hands back to the floors.
            let mut d = TonosVoice::new(SR);
            let mut rd = Rng(seed);
            d.trigger(midi_to_hz(note), 0.7, &p, &mut rd);
            d.set_deep(n as u32);
            for _ in 0..4800 {
                d.render_sample(1.01, 0.0, &mut rd);
            }
            assert!(!d.deep && d.deep_env < 0.05, "{inst}: bend keeps the deep body");
        }
        // Bowed strings never take one.
        let p = params(3);
        let mut v = TonosVoice::new(SR);
        v.trigger(midi_to_hz(62.0), 0.7, &p, &mut Rng(9));
        assert!(!v.set_deep(48000));
    }

    fn params(inst: usize) -> Params {
        let mut p = Params::new();
        p.set(TONOS_BASE + TN_ENABLE, 1.0);
        p.set(TONOS_BASE + TN_INSTRUMENT, inst as f32);
        p
    }

    fn render(p: &Params, midi: f32, secs: f32, hold: f32) -> Vec<f32> {
        let mut v = TonosVoice::new(SR);
        let mut rng = Rng(12345);
        v.trigger(midi_to_hz(midi), 0.8, p, &mut rng);
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

    /// Fundamental by a Hann-windowed DFT scan ±80 cents around the expectation (partials of a
    /// stiff string are sharp, which biases autocorrelation; the fundamental's own peak is not).
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

    #[test]
    fn tonos_every_instrument_is_finite_audible_and_bounded() {
        for i in 0..NUM_INSTRUMENTS {
            let inst = &INSTRUMENTS[i];
            let notes: Vec<f32> = if inst.opens.is_empty() { vec![inst.reference + 2.0, inst.reference + 14.0] } else { vec![inst.opens[0] + 2.0, inst.opens[0] + 9.0] };
            for &n in &notes {
                let x = render(&params(i), n, 1.2, 0.8);
                assert!(x.iter().all(|v| v.is_finite()), "{} {} non-finite", INSTRUMENT_NAMES[i], n);
                let peak = x.iter().fold(0.0f32, |a, v| a.max(v.abs()));
                let r = rms(&x[(0.05 * SR) as usize..(0.5 * SR) as usize]);
                assert!(peak < 3.9, "{} {} peak {}", INSTRUMENT_NAMES[i], n, peak);
                assert!(r > 1e-3, "{} {} too quiet rms {}", INSTRUMENT_NAMES[i], n, r);
            }
        }
    }

    #[test]
    fn tonos_in_tune() {
        for i in 0..NUM_INSTRUMENTS {
            let inst = &INSTRUMENTS[i];
            let mut p = params(i);
            p.set(TONOS_BASE + TN_JAWARI, 0.0); // a sharp bridge for the measurement
            p.set(TONOS_BASE + TN_NONLIN, 0.0);
            p.set(TONOS_BASE + TN_VIB_DEPTH, 0.0);
            p.set(TONOS_BASE + TN_RATTLE, 0.0);
            p.set(TONOS_BASE + TN_TREMOLO, 0.0);
            let base = if inst.opens.is_empty() { inst.reference } else { inst.opens[0] };
            for &n in &[base + 4.0, base + 12.0] {
                let x = render(&p, n, 1.0, 1.0);
                let f = pitch(&x[(0.35 * SR) as usize..(0.85 * SR) as usize], midi_to_hz(n));
                let cents = 1200.0 * (f / midi_to_hz(n)).log2();
                let tol = if matches!(inst.ex, EX_BOW | EX_WHEEL) { 30.0 } else { 12.0 };
                assert!(cents.abs() < tol, "{} note {} off by {:.1} cents ({} Hz)", INSTRUMENT_NAMES[i], n, cents, f);
            }
        }
    }

    #[test]
    fn tonos_string_physics_is_physical() {
        // Sitar main string: slack steel, sub-millimetre, small but real inharmonicity.
        let inst = &INSTRUMENTS[11];
        let s = string_for(inst, &MATERIALS[inst.mat as usize], midi_to_hz(41.0), 1.0, 0);
        assert!(s.d > 1.0e-4 && s.d < 6.0e-4, "sitar d {}", s.d);
        assert!(s.b > 1e-6 && s.b < 1e-3, "sitar B {}", s.b);
        // Oud nylon: around a millimetre.
        let oud = &INSTRUMENTS[19];
        let o = string_for(oud, &MATERIALS[oud.mat as usize], midi_to_hz(50.0), 1.0, 0);
        assert!(o.d > 5.0e-4 && o.d < 1.6e-3, "oud d {}", o.d);
        // Stopping an octave halves the length; the tension and wave speed stay.
        let top = string_for(oud, &MATERIALS[oud.mat as usize], midi_to_hz(60.0), 1.0, 0);
        let o2 = string_for(oud, &MATERIALS[oud.mat as usize], midi_to_hz(72.0), 1.0, 0);
        assert!((o2.l_stop - top.l_stop * 0.5).abs() < 1e-3);
        assert!((o2.t - top.t).abs() < 1e-3 && (o2.c - top.c).abs() < 1e-3);
        // Nylon decays faster in the highs than steel (internal friction).
        let m_n = &MATERIALS[NYLON as usize];
        let m_s = &MATERIALS[STEEL as usize];
        let sn = string_for(oud, m_n, 220.0, 1.0, 0);
        let ss = string_for(oud, m_s, 220.0, 1.0, 0);
        let ratio_n = decay_rate(&sn, m_n, STOP_FRET, 3000.0, 1.0) / decay_rate(&sn, m_n, STOP_FRET, 220.0, 1.0);
        let ratio_s = decay_rate(&ss, m_s, STOP_FRET, 3000.0, 1.0) / decay_rate(&ss, m_s, STOP_FRET, 220.0, 1.0);
        assert!(ratio_n > ratio_s, "nylon {} steel {}", ratio_n, ratio_s);
    }

    fn hf_ratio(x: &[f32]) -> f32 {
        // Energy above ~2 kHz (first difference ×2) over total.
        let d: Vec<f32> = x.windows(2).map(|w| w[1] - w[0]).collect();
        rms(&d) / rms(x).max(1e-9)
    }

    #[test]
    fn tonos_jawari_brightens_and_sustains_the_buzz() {
        let mut off = params(12); // tanpura
        off.set(TONOS_BASE + TN_JAWARI, 0.0);
        let mut on = params(12);
        on.set(TONOS_BASE + TN_JAWARI, 1.0);
        let a = render(&off, 48.0, 1.5, 1.5);
        let b = render(&on, 48.0, 1.5, 1.5);
        let w = (0.4 * SR) as usize..(1.2 * SR) as usize;
        let (ha, hb) = (hf_ratio(&a[w.clone()]), hf_ratio(&b[w]));
        assert!(hb > ha * 1.15, "jawari off {} on {}", ha, hb);
    }

    #[test]
    fn tonos_bow_sustains_until_released() {
        let p = params(3); // erhu
        let x = render(&p, 66.0, 2.5, 1.8);
        let early = rms(&x[(0.4 * SR) as usize..(0.8 * SR) as usize]);
        let late = rms(&x[(1.4 * SR) as usize..(1.8 * SR) as usize]);
        let after = rms(&x[(2.3 * SR) as usize..(2.5 * SR) as usize]);
        assert!(late > early * 0.5, "bow should sustain: {} → {}", early, late);
        assert!(after < late * 0.3, "bow lift should stop it: {} → {}", late, after);
    }

    #[test]
    fn tonos_plucks_decay() {
        let p = params(19); // oud
        let x = render(&p, 57.0, 3.0, 3.0);
        let a = rms(&x[(0.05 * SR) as usize..(0.3 * SR) as usize]);
        let b = rms(&x[(2.5 * SR) as usize..(3.0 * SR) as usize]);
        assert!(b < a * 0.5, "oud should decay: {} → {}", a, b);
    }

    #[test]
    fn tonos_hammer_rebounds() {
        let p = params(16); // santoor
        let mut v = TonosVoice::new(SR);
        let mut rng = Rng(7);
        v.trigger(midi_to_hz(62.0), 0.9, &p, &mut rng);
        for _ in 0..(0.03 * SR) as usize {
            v.render_sample(1.0, 0.0, &mut rng);
        }
        assert!(!v.ham_on, "hammer should have left the string");
        assert!(v.level > 1e-3);
    }

    #[test]
    fn tonos_dan_bau_plays_harmonics() {
        let inst = &INSTRUMENTS[10];
        let s = string_for(inst, &MATERIALS[0], midi_to_hz(67.0), 1.0, 0);
        assert!(s.harmonic >= 2);
        assert!((s.f_loop * s.harmonic as f32 - midi_to_hz(67.0)).abs() < 0.01);
    }

    #[test]
    fn tonos_sympathetic_strings_ring_on() {
        let mut p = params(11);
        p.set(TONOS_BASE + TN_SYMP, 0.8);
        let mut rack = TonosRack::new(SR);
        let mut buf = [[0.0f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS];
        let mut energy_after = 0.0;
        let mut rng = Rng(3);
        for blk in 0..400 {
            for f in 0..crate::engine::MAX_BLOCK {
                let x = if blk < 20 { rng.bipolar() * 0.3 } else { 0.0 };
                buf[0][f] = x;
                buf[1][f] = x;
            }
            rack.process(&mut buf, crate::engine::MAX_BLOCK, 2, &p);
            if blk > 100 {
                for f in 0..crate::engine::MAX_BLOCK {
                    energy_after += buf[0][f] * buf[0][f];
                }
            }
        }
        assert!(energy_after > 1e-4, "tarafs should ring after the input stops: {}", energy_after);
    }

    #[test]
    fn tonos_names_and_table_agree() {
        assert_eq!(INSTRUMENT_NAMES.len(), INSTRUMENTS.len());
        assert_eq!(NUM_INSTRUMENTS, INSTRUMENTS.len());
    }

    /// `cargo test --release tonos_diag -- --ignored --nocapture`: tuning, sustain and level sweep.
    #[test]
    #[ignore]
    fn tonos_diag() {
        for i in 0..NUM_INSTRUMENTS {
            let inst = &INSTRUMENTS[i];
            let mut p = params(i);
            p.set(TONOS_BASE + TN_JAWARI, 0.0);
            p.set(TONOS_BASE + TN_NONLIN, 0.0);
            p.set(TONOS_BASE + TN_VIB_DEPTH, 0.0);
            p.set(TONOS_BASE + TN_RATTLE, 0.0);
            let base = if inst.opens.is_empty() { inst.reference } else { inst.opens[0] };
            let mut line = format!("{:2} {:18}", i, INSTRUMENT_NAMES[i]);
            for &n in &[base + 2.0, base + 4.0, base + 12.0, base + 19.0] {
                let x = render(&p, n, 1.0, 1.0);
                let f = pitch(&x[(0.35 * SR) as usize..(0.85 * SR) as usize], midi_to_hz(n));
                let cents = 1200.0 * (f / midi_to_hz(n)).log2();
                let s = string_for(inst, &MATERIALS[inst.mat as usize], midi_to_hz(n), 1.0, 0);
                line += &format!(" | {:>3} {:+5.1}c B{:.0e} e{:.4} l{:.4}", n, cents, s.b, rms(&x[(0.05 * SR) as usize..(0.3 * SR) as usize]), rms(&x[(0.6 * SR) as usize..(0.9 * SR) as usize]));
            }
            let n = base + 9.0;
            let x = render(&params(i), n, 1.0, 1.0);
            let r = if matches!(inst.ex, EX_BOW | EX_WHEEL) { rms(&x[(0.3 * SR) as usize..(0.9 * SR) as usize]) } else { rms(&x[(0.03 * SR) as usize..(0.4 * SR) as usize]) };
            println!("{}  => level {:.2}", line, inst.level * 0.03 / r.max(1e-6));
        }
    }

    #[test]
    #[ignore]
    fn tonos_cpu() {
        let mut worst = (0usize, 0.0f64);
        for i in 0..NUM_INSTRUMENTS {
            let inst = &INSTRUMENTS[i];
            let n = if inst.opens.is_empty() { inst.reference + 9.0 } else { inst.opens[0] + 7.0 };
            let t0 = std::time::Instant::now();
            let _ = render(&params(i), n, 2.0, 1.5);
            let rt = t0.elapsed().as_secs_f64() / 2.0; // seconds of CPU per second of audio
            if rt > worst.1 {
                worst = (i, rt);
            }
        }
        println!("worst voice: {} uses {:.2}% of one core in real time", INSTRUMENT_NAMES[worst.0], worst.1 * 100.0);
    }

    /// `cargo test --release tonos_levels -- --ignored --nocapture`: RMS per instrument (calibration).
    #[test]
    #[ignore]
    fn tonos_levels() {
        for i in 0..NUM_INSTRUMENTS {
            let inst = &INSTRUMENTS[i];
            let n = if inst.opens.is_empty() { inst.reference + 9.0 } else { inst.opens[0] + 7.0 };
            let x = render(&params(i), n, 1.0, 0.8);
            let peak = x.iter().fold(0.0f32, |a, v| a.max(v.abs()));
            println!("{:2} {:20} rms {:.4} peak {:.3}", i, INSTRUMENT_NAMES[i], rms(&x[..(0.6 * SR) as usize]), peak);
        }
    }
}
