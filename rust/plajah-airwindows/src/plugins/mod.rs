// The curated Airwindows set. Each port is a straight transliteration of the plugin's
// `processReplacing` (the float path a VST host calls) — same variable names in snake_case,
// same order of operations — so it can be diffed against the C++ and checked sample for sample
// by tests/reference.rs. Kind ids are part of the wasm ABI and the saved-project format: append
// only, never renumber. Keep in step with ref/plugins.txt and services/melos/beats/fx/airwindows.ts.

pub mod density;
pub mod purestdrive;
pub mod mojo;
pub mod tube2;
pub mod totape6;
pub mod ironoxide5;
pub mod drumslam;
pub mod buttercomp2;
pub mod pressure4;
pub mod console7channel;
pub mod console7buss;
pub mod baxandall2;
pub mod deess;
pub mod galactic;
pub mod wider;
pub mod derez2;

pub trait Plugin {
    /// `setParameter(index, value)` — values are the VST 0..1 floats, stored as f32 exactly as
    /// the original stores `float A..`.
    fn set_param(&mut self, index: usize, value: f32);
    /// Overwrite the dither/denormal xorshift seeds (the reference test pins them).
    fn seeds(&mut self, l: u32, r: u32);
    /// One host block, in place: `processReplacing` with in == out.
    fn process(&mut self, l: &mut [f32], r: &mut [f32]);
}

/// (kind id, Airwindows name, parameter count).
pub const KINDS: &[(u32, &str, usize)] = &[
    (0, "Density", 4),
    (1, "PurestDrive", 1),
    (2, "Mojo", 1),
    (3, "Tube2", 2),
    (4, "ToTape6", 6),
    (5, "IronOxide5", 7),
    (6, "DrumSlam", 3),
    (7, "ButterComp2", 3),
    (8, "Pressure4", 4),
    (9, "Console7Channel", 1),
    (10, "Console7Buss", 1),
    (11, "Baxandall2", 2),
    (12, "DeEss", 3),
    (13, "Galactic", 5),
    (14, "Wider", 3),
    (15, "DeRez2", 4),
];

pub fn create(kind: u32, sr: f64, seed_l: u32, seed_r: u32) -> Option<Box<dyn Plugin>> {
    Some(match kind {
        0 => Box::new(density::Density::new(sr, seed_l, seed_r)),
        1 => Box::new(purestdrive::PurestDrive::new(sr, seed_l, seed_r)),
        2 => Box::new(mojo::Mojo::new(sr, seed_l, seed_r)),
        3 => Box::new(tube2::Tube2::new(sr, seed_l, seed_r)),
        4 => Box::new(totape6::ToTape6::new(sr, seed_l, seed_r)),
        5 => Box::new(ironoxide5::IronOxide5::new(sr, seed_l, seed_r)),
        6 => Box::new(drumslam::DrumSlam::new(sr, seed_l, seed_r)),
        7 => Box::new(buttercomp2::ButterComp2::new(sr, seed_l, seed_r)),
        8 => Box::new(pressure4::Pressure4::new(sr, seed_l, seed_r)),
        9 => Box::new(console7channel::Console7Channel::new(sr, seed_l, seed_r)),
        10 => Box::new(console7buss::Console7Buss::new(sr, seed_l, seed_r)),
        11 => Box::new(baxandall2::Baxandall2::new(sr, seed_l, seed_r)),
        12 => Box::new(deess::DeEss::new(sr, seed_l, seed_r)),
        13 => Box::new(galactic::Galactic::new(sr, seed_l, seed_r)),
        14 => Box::new(wider::Wider::new(sr, seed_l, seed_r)),
        15 => Box::new(derez2::DeRez2::new(sr, seed_l, seed_r)),
        _ => return None,
    })
}

pub fn kind_by_name(name: &str) -> Option<(u32, usize)> {
    KINDS.iter().find(|k| k.1 == name).map(|k| (k.0, k.2))
}
