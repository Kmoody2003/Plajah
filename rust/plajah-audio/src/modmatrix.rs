//! The modulation matrix.
//!
//! This is the part that makes a synth feel like Massive: any source onto any destination, with
//! a signed depth, evaluated per voice. The UI's drag-a-source-onto-a-knob gesture creates one
//! `Route`; the coloured arc it draws on the knob is just `depth` rendered honestly.

pub const MAX_ROUTES: usize = 32;

/// Modulation sources. Per-voice sources (envelopes, velocity, per-voice random) are evaluated
/// inside the voice; global ones (LFOs when not retriggered, macros) are shared.
#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum ModSource {
    None = 0,
    Env1 = 1,
    Env2 = 2,
    Env3 = 3,
    Lfo1 = 8,
    Lfo2 = 9,
    Lfo3 = 10,
    Velocity = 16,
    KeyTrack = 17,
    ModWheel = 18,
    Pressure = 19,
    /// MPE per-note slide / timbre (CC74). Wired now so MPE is additive later, not a rewrite.
    Timbre = 20,
    PitchBend = 21,
    RandomPerVoice = 22,
    Macro1 = 24,
    Macro2 = 25,
    Macro3 = 26,
    Macro4 = 27,
    Macro5 = 28,
    Macro6 = 29,
    Macro7 = 30,
    Macro8 = 31,
}

impl ModSource {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => Self::Env1, 2 => Self::Env2, 3 => Self::Env3,
            8 => Self::Lfo1, 9 => Self::Lfo2, 10 => Self::Lfo3,
            16 => Self::Velocity, 17 => Self::KeyTrack, 18 => Self::ModWheel,
            19 => Self::Pressure, 20 => Self::Timbre, 21 => Self::PitchBend,
            22 => Self::RandomPerVoice,
            24 => Self::Macro1, 25 => Self::Macro2, 26 => Self::Macro3, 27 => Self::Macro4,
            28 => Self::Macro5, 29 => Self::Macro6, 30 => Self::Macro7, 31 => Self::Macro8,
            _ => Self::None,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Route {
    pub source: ModSource,
    /// Destination parameter id — the same id space the host uses for `set_param`.
    pub dest: u32,
    /// Signed, -1..1, scaled by the destination's own range.
    pub depth: f32,
    /// Optional second source that scales this route (Massive/Serum "sidechain" modulation).
    pub via: ModSource,
    pub active: bool,
}

impl Default for Route {
    fn default() -> Self {
        Self { source: ModSource::None, dest: 0, depth: 0.0, via: ModSource::None, active: false }
    }
}

/// The per-voice snapshot of every modulation source, refreshed once per control block.
#[derive(Clone, Copy, Default)]
pub struct ModValues {
    pub env: [f32; 3],
    pub lfo: [f32; 3],
    pub velocity: f32,
    pub key_track: f32,
    pub mod_wheel: f32,
    pub pressure: f32,
    pub timbre: f32,
    pub pitch_bend: f32,
    pub random: f32,
    pub macros: [f32; 8],
}

impl ModValues {
    #[inline]
    pub fn get(&self, s: ModSource) -> f32 {
        match s {
            ModSource::None => 0.0,
            ModSource::Env1 => self.env[0],
            ModSource::Env2 => self.env[1],
            ModSource::Env3 => self.env[2],
            ModSource::Lfo1 => self.lfo[0],
            ModSource::Lfo2 => self.lfo[1],
            ModSource::Lfo3 => self.lfo[2],
            ModSource::Velocity => self.velocity,
            ModSource::KeyTrack => self.key_track,
            ModSource::ModWheel => self.mod_wheel,
            ModSource::Pressure => self.pressure,
            ModSource::Timbre => self.timbre,
            ModSource::PitchBend => self.pitch_bend,
            ModSource::RandomPerVoice => self.random,
            ModSource::Macro1 => self.macros[0],
            ModSource::Macro2 => self.macros[1],
            ModSource::Macro3 => self.macros[2],
            ModSource::Macro4 => self.macros[3],
            ModSource::Macro5 => self.macros[4],
            ModSource::Macro6 => self.macros[5],
            ModSource::Macro7 => self.macros[6],
            ModSource::Macro8 => self.macros[7],
        }
    }
}

#[derive(Clone, Copy)]
pub struct ModMatrix {
    pub routes: [Route; MAX_ROUTES],
}

impl Default for ModMatrix {
    fn default() -> Self {
        Self { routes: [Route::default(); MAX_ROUTES] }
    }
}

impl ModMatrix {
    /// Total modulation offset for one destination, in normalised units (-1..1 before scaling).
    #[inline]
    pub fn amount_for(&self, dest: u32, v: &ModValues) -> f32 {
        let mut acc = 0.0;
        for r in self.routes.iter() {
            if !r.active || r.dest != dest {
                continue;
            }
            let mut a = v.get(r.source) * r.depth;
            if r.via != ModSource::None {
                a *= v.get(r.via);
            }
            acc += a;
        }
        acc
    }
}
