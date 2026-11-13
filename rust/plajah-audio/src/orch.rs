//! The orchestra & guitar family behind one voice slot: ARCO (bowed strings), CORNU (brass),
//! AULOS (woodwinds), KITHARA (acoustic guitars) and VOLTA (electric guitars and basses).
//!
//! Their per-voice state is large (a section is up to eight strings), so it is allocated only
//! when a track switches one of them on (`OrchVoice::ensure`, called from `Engine::set_param`),
//! never on the render path, and an ONDA or SOMA track pays nothing for it.

use crate::arco::{ArcoRack, ArcoVoice};
use crate::osc::Rng;
use crate::params::*;

pub const KIND_NONE: u8 = 0;
pub const KIND_ARCO: u8 = 1;

/// Which family model a patch enables (the first one switched on).
pub fn kind_for(p: &Params) -> u8 {
    if p.get(ARCO_BASE + AR_ENABLE) > 0.5 {
        return KIND_ARCO;
    }
    KIND_NONE
}

pub struct OrchVoice {
    pub arco: Option<Box<ArcoVoice>>,
    kind: u8,
    pub rng: Rng,
    sr: f32,
}

impl OrchVoice {
    pub fn new(seed: u32) -> Self {
        OrchVoice { arco: None, kind: KIND_NONE, rng: Rng((seed ^ 0x4F52_4348) | 1), sr: 48000.0 }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr;
        if let Some(a) = self.arco.as_mut() {
            a.set_sample_rate(sr);
        }
    }

    /// Allocate the model a patch needs (outside the render path).
    pub fn ensure(&mut self, kind: u8) {
        if kind == KIND_ARCO && self.arco.is_none() {
            self.arco = Some(Box::new(ArcoVoice::new(self.sr)));
        }
    }

    pub fn kind(&self) -> u8 {
        self.kind
    }

    /// Start a note. False when the patch enables no family model (or it isn't allocated yet).
    pub fn trigger(&mut self, p: &Params, hz: f32, vel: f32) -> bool {
        self.kind = KIND_NONE;
        match kind_for(p) {
            KIND_ARCO => {
                if let Some(a) = self.arco.as_mut() {
                    a.set_sample_rate(self.sr);
                    a.trigger(hz, vel, p, &mut self.rng);
                    self.kind = KIND_ARCO;
                }
            }
            _ => {}
        }
        self.kind != KIND_NONE
    }

    pub fn slur(&mut self, p: &Params, hz: f32, vel: f32) {
        if self.kind == KIND_ARCO {
            if let Some(a) = self.arco.as_mut() {
                a.slur(hz, vel, p, &mut self.rng);
            }
        }
    }

    pub fn release(&mut self) {
        if self.kind == KIND_ARCO {
            if let Some(a) = self.arco.as_mut() {
                a.release();
            }
        }
    }

    pub fn reset(&mut self) {
        if let Some(a) = self.arco.as_mut() {
            a.reset();
        }
        self.kind = KIND_NONE;
    }

    pub fn is_quiet(&self) -> bool {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.is_quiet()).unwrap_or(true),
            _ => true,
        }
    }

    pub fn samples(&self) -> u32 {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.samples()).unwrap_or(0),
            _ => 0,
        }
    }

    /// Sustained (bowed, blown) notes can slur; plucks restart.
    pub fn is_sustained(&self) -> bool {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.is_bowed()).unwrap_or(false),
            _ => false,
        }
    }

    /// One stereo sample, plus (bus index, force) for the deep body.
    #[inline]
    pub fn render_sample(&mut self, bend: f32, mod_wheel: f32) -> (f32, f32, usize, f32) {
        match self.kind {
            KIND_ARCO => {
                if let Some(a) = self.arco.as_mut() {
                    let (l, r) = a.render_sample(bend, mod_wheel, &mut self.rng);
                    return (l, r, a.role.bus.min(crate::arco::NBUS - 1), a.bus_out);
                }
                (0.0, 0.0, 0, 0.0)
            }
            _ => (0.0, 0.0, 0, 0.0),
        }
    }
}

/// The family's after-the-voices stages (deep bodies, amps).
pub struct OrchRack {
    pub arco: Option<Box<ArcoRack>>,
}

impl OrchRack {
    pub fn new() -> Self {
        OrchRack { arco: None }
    }
    pub fn ensure(&mut self, kind: u8) {
        if kind == KIND_ARCO && self.arco.is_none() {
            self.arco = Some(Box::new(ArcoRack::new()));
        }
    }
    pub fn clear_bus(&mut self, frames: usize) {
        if let Some(r) = self.arco.as_mut() {
            r.clear_bus(frames);
        }
    }
    /// Deep-body bus the voices sum their bridge forces into.
    pub fn bus(&mut self) -> Option<&mut [[f32; crate::engine::MAX_BLOCK]; crate::arco::NBUS]> {
        self.arco.as_mut().map(|r| &mut r.bus)
    }
    pub fn process(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params, sr: f32) {
        if ArcoRack::active(p) {
            if let Some(r) = self.arco.as_mut() {
                r.process(out, frames, nch, p, sr);
            }
        }
    }
}

impl Default for OrchRack {
    fn default() -> Self {
        Self::new()
    }
}
