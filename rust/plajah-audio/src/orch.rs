//! The orchestra & guitar family behind one voice slot: ARCO (bowed strings), CORNU (brass),
//! AULOS (woodwinds), KITHARA (acoustic guitars) and VOLTA (electric guitars and basses).
//!
//! Their per-voice state is large (a section is up to eight strings), so it is allocated only
//! when a track switches one of them on (`OrchVoice::ensure`, called from `Engine::set_param`),
//! never on the render path, and an ONDA or SOMA track pays nothing for it.
//!
//! Ensembles are shared: a model describes its sections (instrument, seat, players, range) and
//! the engine deals each chord out across them (`assign_sections`), sharing a section's players
//! among the notes it gets (divisi).

use crate::arco::{ArcoRack, ArcoVoice};
use crate::cornu::CornuVoice;
use crate::osc::Rng;
use crate::params::*;

pub const KIND_NONE: u8 = 0;
pub const KIND_ARCO: u8 = 1;
pub const KIND_CORNU: u8 = 2;

/// Which family model a patch enables (the first one switched on).
pub fn kind_for(p: &Params) -> u8 {
    if p.get(ARCO_BASE + AR_ENABLE) > 0.5 {
        return KIND_ARCO;
    }
    if p.get(CORNU_BASE + CN_ENABLE) > 0.5 {
        return KIND_CORNU;
    }
    KIND_NONE
}

/// Is `id` one of the family's enable switches?
pub fn is_enable(id: u32) -> bool {
    id == ARCO_BASE + AR_ENABLE || id == CORNU_BASE + CN_ENABLE
}

/// What a voice plays inside an ensemble.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Role {
    pub inst: usize,
    pub section: usize, // seat on the stage (model-specific numbering)
    pub players: usize, // players represented by this note
    pub bus: usize,     // deep-body bus (bowed strings)
}

impl Default for Role {
    fn default() -> Self {
        Role { inst: 0, section: 0, players: 1, bus: 0 }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Section {
    pub inst: usize,
    pub seat: usize,
    pub players: usize,
    pub bus: usize,
    pub lo: f32,
    pub hi: f32,
    pub lowest: f32,
}

/// An ensemble: up to five sections, high to low.
#[derive(Clone, Copy, Debug, Default)]
pub struct Ensemble {
    pub secs: [Section; 5],
    pub n: usize,
    /// One instrument: every held note shares the section's players (divisi across all of them).
    pub single: bool,
}

fn idx(p: &Params, id: u32, n: usize) -> usize {
    (p.get(id).round().max(0.0) as usize).min(n.saturating_sub(1))
}

/// The ensemble a patch asks for.
pub fn ensemble(kind: u8, p: &Params) -> Option<Ensemble> {
    let mut e = Ensemble::default();
    match kind {
        KIND_ARCO => {
            use crate::arco::*;
            let ens = idx(p, ARCO_BASE + AR_ENSEMBLE, ENSEMBLE_NAMES.len());
            if ens == 0 {
                let inst = idx(p, ARCO_BASE + AR_INSTRUMENT, NUM_INSTRUMENTS);
                let size = SECTION_SIZES[idx(p, ARCO_BASE + AR_SECTION, SECTION_SIZES.len())];
                let (lo, hi, lowest) = section_range(inst);
                e.secs[0] = Section { inst, seat: [0, 2, 3, 4][inst], players: size, bus: 0, lo, hi, lowest };
                e.n = 1;
                e.single = true;
            } else {
                let (secs, n) = ensemble_sections(ens, false);
                for (i, &(inst, seat, players)) in secs.iter().take(n).enumerate() {
                    let (lo, hi, lowest) = section_range(inst);
                    e.secs[i] = Section { inst, seat, players, bus: inst, lo, hi, lowest };
                }
                e.n = n;
            }
        }
        KIND_CORNU => {
            use crate::cornu::*;
            let ens = idx(p, CORNU_BASE + CN_ENSEMBLE, ENSEMBLE_NAMES.len());
            if ens == 0 {
                let inst = idx(p, CORNU_BASE + CN_INSTRUMENT, NUM_INSTRUMENTS);
                let size = SECTION_SIZES[idx(p, CORNU_BASE + CN_SECTION, SECTION_SIZES.len())];
                let (lo, hi, lowest) = section_range(inst);
                e.secs[0] = Section { inst, seat: 0, players: size, bus: 0, lo, hi, lowest };
                e.n = 1;
                e.single = true;
            } else {
                let (secs, n) = ensemble_sections(ens);
                for (i, &(inst, seat, players)) in secs.iter().take(n).enumerate() {
                    let (lo, hi, lowest) = section_range(inst);
                    e.secs[i] = Section { inst, seat, players, bus: 0, lo, hi, lowest };
                }
                e.n = n;
            }
        }
        _ => return None,
    }
    Some(e)
}

/// Does a note into one held note slur (single instrument only — an ensemble re-voices instead)?
pub fn legato_on(kind: u8, p: &Params) -> bool {
    match kind {
        KIND_ARCO => p.get(ARCO_BASE + AR_LEGATO) > 0.5 && p.get(ARCO_BASE + AR_ENSEMBLE) < 0.5,
        KIND_CORNU => p.get(CORNU_BASE + CN_LEGATO) > 0.5 && p.get(CORNU_BASE + CN_ENSEMBLE) < 0.5,
        _ => false,
    }
}

/// Deal notes (sorted high → low) across an ensemble's sections, keeping order (a higher note
/// never goes to a lower section) and preferring each section's comfortable range. Several notes
/// on one section are divisi.
pub fn assign_sections(notes_desc: &[f32], e: &Ensemble, out: &mut [usize]) {
    let n = notes_desc.len().min(out.len()).min(32);
    let ns = e.n.max(1);
    if ns == 1 || n == 0 {
        out.iter_mut().take(n).for_each(|o| *o = 0);
        return;
    }
    let cost = |note: f32, s: usize| -> f32 {
        let sec = &e.secs[s];
        if note < sec.lowest - 0.01 {
            return 1.0e6;
        }
        let d = if note < sec.lo { sec.lo - note } else if note > sec.hi { note - sec.hi } else { 0.0 };
        d * d
    };
    const INF: f32 = 1.0e12;
    let mut dp = [[INF; 5]; 32];
    let mut from = [[0usize; 5]; 32];
    for s in 0..ns {
        dp[0][s] = cost(notes_desc[0], s);
    }
    for i in 1..n {
        for s in 0..ns {
            let c = cost(notes_desc[i], s);
            let mut best = (INF, 0);
            for t in 0..=s {
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
    let mut s = (0..ns).min_by(|&a, &b| dp[n - 1][a].partial_cmp(&dp[n - 1][b]).unwrap_or(core::cmp::Ordering::Equal)).unwrap_or(0);
    for i in (0..n).rev() {
        out[i] = s;
        s = from[i][s];
    }
}

pub struct OrchVoice {
    pub arco: Option<Box<ArcoVoice>>,
    pub cornu: Option<Box<CornuVoice>>,
    kind: u8,
    pub rng: Rng,
    sr: f32,
}

impl OrchVoice {
    pub fn new(seed: u32) -> Self {
        OrchVoice { arco: None, cornu: None, kind: KIND_NONE, rng: Rng((seed ^ 0x4F52_4348) | 1), sr: 48000.0 }
    }

    pub fn set_sample_rate(&mut self, sr: f32) {
        self.sr = sr;
        if let Some(a) = self.arco.as_mut() {
            a.set_sample_rate(sr);
        }
        if let Some(c) = self.cornu.as_mut() {
            c.set_sample_rate(sr);
        }
    }

    /// Allocate the model a patch needs (outside the render path).
    pub fn ensure(&mut self, kind: u8) {
        if kind == KIND_ARCO && self.arco.is_none() {
            self.arco = Some(Box::new(ArcoVoice::new(self.sr)));
        }
        if kind == KIND_CORNU && self.cornu.is_none() {
            self.cornu = Some(Box::new(CornuVoice::new(self.sr)));
        }
    }

    pub fn kind(&self) -> u8 {
        self.kind
    }

    /// Set the role the next trigger plays (ensembles).
    pub fn set_role(&mut self, r: Role) -> bool {
        let mut changed = false;
        if let Some(a) = self.arco.as_mut() {
            let nr = crate::arco::Role { inst: r.inst, section: r.section, players: r.players, bus: r.bus };
            changed |= a.role.inst != nr.inst || a.role.players != nr.players || a.role.section != nr.section;
            a.role = nr;
        }
        if let Some(c) = self.cornu.as_mut() {
            let nr = crate::cornu::Role { inst: r.inst, section: r.section, players: r.players };
            changed |= c.role.inst != nr.inst || c.role.players != nr.players || c.role.section != nr.section;
            c.role = nr;
        }
        changed
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
            KIND_CORNU => {
                if let Some(c) = self.cornu.as_mut() {
                    c.set_sample_rate(self.sr);
                    c.trigger(hz, vel, p, &mut self.rng);
                    self.kind = KIND_CORNU;
                }
            }
            _ => {}
        }
        self.kind != KIND_NONE
    }

    pub fn slur(&mut self, p: &Params, hz: f32, vel: f32) {
        match self.kind {
            KIND_ARCO => {
                if let Some(a) = self.arco.as_mut() {
                    a.slur(hz, vel, p, &mut self.rng);
                }
            }
            KIND_CORNU => {
                if let Some(c) = self.cornu.as_mut() {
                    c.slur(hz, vel, p, &mut self.rng);
                }
            }
            _ => {}
        }
    }

    pub fn release(&mut self) {
        match self.kind {
            KIND_ARCO => {
                if let Some(a) = self.arco.as_mut() {
                    a.release();
                }
            }
            KIND_CORNU => {
                if let Some(c) = self.cornu.as_mut() {
                    c.release();
                }
            }
            _ => {}
        }
    }

    pub fn reset(&mut self) {
        if let Some(a) = self.arco.as_mut() {
            a.reset();
        }
        if let Some(c) = self.cornu.as_mut() {
            c.reset();
        }
        self.kind = KIND_NONE;
    }

    pub fn is_quiet(&self) -> bool {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.is_quiet()).unwrap_or(true),
            KIND_CORNU => self.cornu.as_ref().map(|c| c.is_quiet()).unwrap_or(true),
            _ => true,
        }
    }

    pub fn samples(&self) -> u32 {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.samples()).unwrap_or(0),
            KIND_CORNU => self.cornu.as_ref().map(|c| c.samples()).unwrap_or(0),
            _ => 0,
        }
    }

    /// Sustained (bowed, blown) notes can slur; plucks restart.
    pub fn is_sustained(&self) -> bool {
        match self.kind {
            KIND_ARCO => self.arco.as_ref().map(|a| a.is_bowed()).unwrap_or(false),
            KIND_CORNU => self.cornu.as_ref().map(|c| c.is_sustained()).unwrap_or(false),
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
            KIND_CORNU => {
                if let Some(c) = self.cornu.as_mut() {
                    let (l, r) = c.render_sample(bend, mod_wheel, &mut self.rng);
                    return (l, r, 0, 0.0);
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
