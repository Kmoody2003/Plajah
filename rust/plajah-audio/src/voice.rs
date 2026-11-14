//! One synth voice: oscillators → filters → amp → spatial pan.
//!
//! Modulation runs at control rate (every `CONTROL_BLOCK` samples) rather than per sample. At
//! 48k that is a ~3 kHz control rate — inaudibly smooth for envelopes and LFOs, and ~16× cheaper
//! than evaluating the whole mod matrix per sample. Cutoff and amp are additionally one-pole
//! smoothed so a control step never produces a zipper.

use crate::bajo::{wob_eval, WobbleFrame};
use crate::env::Envelope;
use crate::exciter::{Exciter, ExciterSpec, ExciterType};
use crate::filter::{Ladder, Svf, SvfMode};
use crate::lfo::Lfo;
use crate::lyra::LyraVoice;
use crate::modal::{partial_count, BankMode, Material, ModalBank, ModalSpec};
use crate::modmatrix::{ModMatrix, ModValues};
use crate::orch::OrchVoice;
use crate::osc::{poly_blep, unison_detune_curve, AnalogShape, Noise, Phasor, Rng};
use crate::params::*;
use crate::sample::{SampleBank, SampleVoice};
use crate::shaper::{ShapeMode, Shaper};
use crate::soma::SomaVoice;
use crate::spatial::{pan_gains, Layout, Position, MAX_CHANNELS};
use crate::string::StringVoice;
use crate::tables::WaveTable;
use crate::tonos::TonosVoice;
use crate::volta::{VoltaVoice, VOLTA_PROBE_COUNT};

pub const CONTROL_BLOCK: usize = 16;
pub const MAX_UNISON: usize = 16;
const NUM_OSC: usize = 3;

#[inline]
pub(crate) fn midi_to_hz(note: f32) -> f32 {
    440.0 * (2.0f32).powf((note - 69.0) / 12.0)
}

/// Per-note expression. Present from day one so MPE is additive later, not a rewrite.
#[derive(Clone, Copy, Default)]
pub struct Expression {
    pub pitch_bend: f32, // -1..1
    pub pressure: f32,   // 0..1
    pub timbre: f32,     // 0..1 (MPE slide / CC74)
}

pub struct Voice {
    pub active: bool,
    pub note: f32,
    pub velocity: f32,
    pub voice_id: u32,
    pub age: u64,
    pub released: bool,
    pub expr: Expression,

    /// Set when a note is scheduled ahead of time — the voice stays silent until the sample
    /// offset arrives, which is how `postMessage` timing becomes sample-accurate timing.
    pub start_delay: u32,

    phasors: [[Phasor; MAX_UNISON]; NUM_OSC],
    sub: Phasor,
    noise: Noise,
    rng: Rng,
    drift: [f32; NUM_OSC],

    envs: [Envelope; NUM_ENV],
    /// Per-voice LFO instances (used when `L_PER_VOICE > 0.5` so chords have independent LFO phase/fade).
    pub(crate) lfos: [Lfo; NUM_LFO],
    lfo_rng: Rng,

    // One filter instance per channel per slot: the panned channels are different signals, and
    // sharing one filter state across them would smear the image and mismatch the response.
    ladders: [[Ladder; MAX_CHANNELS]; 2],
    svfs: [[Svf; MAX_CHANNELS]; 2],
    shapers: [Shaper; NUM_OSC],

    glide_note: f32,
    cutoff_smooth: [f32; 2],
    amp_smooth: f32,

    /// VELA. When the modal body is enabled it REPLACES the oscillator path entirely — an
    /// exciter drives a resonator bank and there is no filter stage, because a modal bank is
    /// already a bank of filters.
    modal: ModalBank,
    exciter: Exciter,
    /// Swell state: 0..1, ramped over the attack time. A modal bank can only ever decay on its
    /// own, so this is the one thing that makes a pad possible at all.
    swell: f32,
    swell_inc: f32,
    /// Release fade for Sustained mode. A driven bank does not decay on its own, so note-off
    /// has to take the level down or the note never ends.
    gate_amp: f32,
    /// Latched at note-on. A voice that started as a modal voice stays one for its whole life,
    /// so toggling the body mid-tail cannot strand a ringing bank.
    modal_active: bool,

    /// Sample playback (KERA). Inactive (slot -1) for synth voices; when active the sample
    /// replaces the oscillators and everything downstream is shared with the synth path.
    sample: SampleVoice,
    /// Extra detune in cents from the zone, folded into the sample's resampling ratio.
    sample_detune: f32,
    /// BAJO's string engine. Allocated once at engine construction (see `init_sr`) so nothing
    /// ever allocates on the audio thread.
    string: StringVoice,
    /// Per-voice wobble smoothing state. Every voice follows the same phase from the engine, so
    /// they agree; only the one-pole is local.
    wob_smooth: f32,

    /// AURA per-voice vintage circuit state: separate RNG so existing instruments stay
    /// bit-identical, permanent voice-card trimpot tolerances, thermal wander, Osc 2 feedback,
    /// and Sample & Hold / Source of Uncertainty random modulation on note-on & sustain.
    aura_rng: Rng,
    card_tol: [f32; 3],
    thermal_walk: f32,
    last_osc2: [f32; MAX_UNISON],
    note_rand: [f32; 3],
    sh_phase: f32,
    sh_target: [f32; 3],
    sh_slew: [f32; 3],
    /// SOMA physical-modeling acoustic percussion & chamber voice.
    soma: SomaVoice,
    soma_rng: Rng,
    soma_active: bool,
    /// Level of the GPU deep-skin layer this SOMA note plays from `sample` (0 = none).
    soma_deep_gain: f32,
    /// LYRA physical models (guitar, piano, violin, sax, trumpet, tine piano).
    lyra: LyraVoice,
    lyra_rng: Rng,
    lyra_active: bool,
    /// TONOS world-string voice.
    tonos: TonosVoice,
    tonos_rng: Rng,
    tonos_active: bool,
    /// ARCO / CORNU / AULOS / KITHARA (allocated only when a patch enables one).
    pub(crate) orch: OrchVoice,
    orch_active: bool,
    /// VOLTA circuit-modeled vintage+modern super synth.
    pub(crate) volta: VoltaVoice,
    volta_active: bool,
}

impl Voice {
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng(seed | 1);
        let mut drift = [0.0f32; NUM_OSC];
        for d in drift.iter_mut() {
            *d = rng.bipolar();
        }
        let mut aura_rng = Rng((seed ^ 0xA5A5_1968) | 1);
        let card_tol = [aura_rng.bipolar(), aura_rng.bipolar(), aura_rng.bipolar()];
        Self {
            string: StringVoice::new(48000.0, seed ^ 0x5F35_63AD),
            wob_smooth: 0.0,
            aura_rng,
            card_tol,
            thermal_walk: 0.0,
            last_osc2: [0.0; MAX_UNISON],
            note_rand: [0.0; 3],
            sh_phase: 0.0,
            sh_target: [0.0; 3],
            sh_slew: [0.0; 3],
            soma: SomaVoice::new(48000.0),
            soma_rng: Rng((seed ^ 0x504D_4131) | 1),
            soma_active: false,
            soma_deep_gain: 0.0,
            lyra: LyraVoice::new(48000.0),
            lyra_rng: Rng((seed ^ 0x4C59_5241) | 1),
            lyra_active: false,
            tonos: TonosVoice::new(48000.0),
            tonos_rng: Rng((seed ^ 0x544F_4E53) | 1),
            tonos_active: false,
            orch: OrchVoice::new(seed),
            orch_active: false,
            volta: VoltaVoice::new(48000.0, seed),
            volta_active: false,
            active: false,
            note: 60.0,
            velocity: 0.8,
            voice_id: 0,
            age: 0,
            released: false,
            expr: Expression::default(),
            start_delay: 0,
            phasors: [[Phasor::default(); MAX_UNISON]; NUM_OSC],
            sub: Phasor::default(),
            noise: Noise::default(),
            rng,
            drift,
            envs: [Envelope::default(); NUM_ENV],
            lfos: core::array::from_fn(|_| Lfo::default()),
            lfo_rng: Rng((seed ^ 0x4C46_4F31) | 1),
            ladders: [[Ladder::default(); MAX_CHANNELS]; 2],
            svfs: [[Svf::default(); MAX_CHANNELS]; 2],
            shapers: [Shaper::default(); NUM_OSC],
            glide_note: 60.0,
            cutoff_smooth: [1000.0; 2],
            amp_smooth: 0.0,
            modal: ModalBank::new(seed),
            modal_active: false,
            swell: 1.0,
            swell_inc: 1.0,
            gate_amp: 0.0,
            exciter: {
                let mut e = Exciter::default();
                e.reseed(seed);
                e
            },
            sample: {
                let mut s = SampleVoice::default();
                s.clear();
                s
            },
            sample_detune: 0.0,
        }
    }

    /// Size the string's delay line for the real sample rate. Called once at engine
    /// construction — never on the audio thread.
    pub fn init_sr(&mut self, sr: f32, seed: u32) {
        self.string = StringVoice::new(sr, seed ^ 0x5F35_63AD);
        self.soma.set_sample_rate(sr);
        self.lyra.set_sample_rate(sr);
        self.tonos.set_sample_rate(sr);
        self.orch.set_sample_rate(sr);
        self.volta.set_sample_rate(sr);
    }

    /// Assign a sample to this voice — call right after `note_on` for a KERA voice. `start_frame`
    /// lets the host honour a zone's play-start offset; `detune_cents` folds in the zone tuning.
    pub fn set_sample(&mut self, slot: i32, start_frame: f64, detune_cents: f32) {
        self.sample.start(slot, start_frame);
        self.sample_detune = detune_cents;
    }

    /// SOMA deep skin: this strike also plays the GPU-rendered upper membrane in `slot` (stereo,
    /// at `gain`), and the noise cloud stops standing in for the modes it covers (< `top_ratio`).
    /// Returns false when this isn't a SOMA voice.
    pub fn set_soma_deep(&mut self, slot: i32, gain: f32, top_ratio: f32) -> bool {
        if !self.soma_active || slot < 0 {
            return false;
        }
        self.sample.start(slot, 0.0);
        self.soma_deep_gain = gain.max(0.0);
        self.soma.gate_cloud_below(top_ratio);
        true
    }

    /// TONOS deep body: replay this note's string from the seed its layer was recorded with (so the
    /// two match sample for sample), and play the GPU-rendered upper body from `slot` at `gain`.
    /// Returns false when this isn't a plucked/struck TONOS voice.
    pub fn set_tonos_deep(&mut self, slot: i32, gain: f32, variant: u32, p: &Params, bank: &SampleBank) -> bool {
        // A slur (t > 0) keeps its string sounding: no replay, no layer.
        if !self.tonos_active || slot < 0 || self.tonos.samples() != 0 {
            return false;
        }
        let Some(frames) = bank.get(slot as usize).map(|s| s.frames as u32) else { return false };
        self.tonos_rng = Rng(crate::tonos::deep_seed(self.note, variant));
        self.tonos.trigger(midi_to_hz(self.note), self.velocity, p, &mut self.tonos_rng);
        if !self.tonos.set_deep(frames) {
            return false;
        }
        self.sample.start(slot, 0.0);
        self.soma_deep_gain = gain.max(0.0);
        true
    }

    pub fn note_on(&mut self, note: f32, vel: f32, id: u32, p: &Params, glide_from: Option<f32>, delay: u32, sr_hint: f32) {
        self.active = true;
        self.released = false;
        self.note = note;
        self.velocity = vel.clamp(0.0, 1.0);
        self.voice_id = id;
        self.start_delay = delay;
        // Strike the string. Only when the section is actually in use — an ONDA patch must not
        // pay for a delay line it never reads.
        if p.get(STR_BASE + S_LEVEL) > 0.0001 {
            self.string.pluck(p.get(STR_BASE + S_PICK), self.velocity);
        }
        self.wob_smooth = 0.0;
        self.expr = Expression::default();
        self.glide_note = glide_from.unwrap_or(note);
        self.sample.clear(); // synth mode by default; a KERA note-on calls set_sample after
        self.soma_deep_gain = 0.0;

        let free_phase = p.get(osc_param(0, O_PHASE)) >= 0.999;
        for o in 0..NUM_OSC {
            let start = p.get(osc_param(o, O_PHASE));
            for u in 0..MAX_UNISON {
                let ph = if free_phase {
                    self.rng.next_f32()
                } else {
                    // A small per-unison phase spread avoids the "all voices start together"
                    // transient click and thickens the attack.
                    (start + u as f32 * 0.031) % 1.0
                };
                self.phasors[o][u].reset(ph);
            }
            self.shapers[o] = Shaper::default();
        }
        self.sub.reset(0.0);
        for slot in 0..2 {
            for c in 0..MAX_CHANNELS {
                self.ladders[slot][c].reset();
                self.svfs[slot][c].reset();
            }
        }
        self.last_osc2 = [0.0; MAX_UNISON];
        self.note_rand = [
            self.aura_rng.bipolar(),
            self.aura_rng.bipolar(),
            self.aura_rng.bipolar(),
        ];
        self.sh_phase = 0.0;
        self.sh_target = self.note_rand;
        self.sh_slew = self.note_rand;

        for i in 0..NUM_LFO {
            if p.get(lfo_param(i, L_PER_VOICE)) > 0.5 {
                let retrig = p.get(lfo_param(i, L_RETRIGGER)) > 0.5;
                self.lfos[i].retrigger = retrig;
                // Per-voice LFOs reset their fade envelope on every new voice; phase resets if
                // retrigger is enabled, or starts at a deterministic voice-spread offset if free-running.
                if retrig {
                    self.lfos[i].force_reset(&mut self.lfo_rng);
                } else {
                    self.lfos[i].reset_fade();
                }
            }
        }

        let aura_env = p.get(AURA_BASE + A_AURA).clamp(0.0, 1.0);
        let drift_env = p.get(P_ANALOG_DRIFT).clamp(0.0, 1.0);
        let env_tol_amt = aura_env + drift_env * 0.45;
        let env_scale = if env_tol_amt > 0.0005 {
            1.0 + self.card_tol[2] * 0.14 * env_tol_amt.min(1.2)
        } else {
            1.0
        };
        for e in 0..NUM_ENV {
            self.envs[e].set_adsr(
                env_time(p.get(env_param(e, E_ATTACK))) * env_scale,
                env_time(p.get(env_param(e, E_DECAY))) * env_scale,
                p.get(env_param(e, E_SUSTAIN)),
                env_time(p.get(env_param(e, E_RELEASE))) * env_scale,
            );
            self.envs[e].note_on();
        }
        self.amp_smooth = 0.0;

        // VELA: lay out the partials for this pitch, then arm the exciter.
        self.modal_active = p.get(MODAL_BASE + M_ENABLE) > 0.5;
        self.soma_active = p.get(SOMA_BASE + SM_ENABLE) > 0.5;
        if self.soma_active {
            self.soma.set_sample_rate(sr_hint);
            self.soma.trigger(midi_to_hz(note), self.velocity, p, &mut self.soma_rng);
            self.soma.deep_in = [0.0; 2];
        }
        self.lyra_active = !self.soma_active && p.get(LYRA_BASE + LY_ENABLE) > 0.5;
        if self.lyra_active {
            self.lyra.set_sample_rate(sr_hint);
            self.lyra.trigger(midi_to_hz(note), self.velocity, p, &mut self.lyra_rng);
        }
        self.tonos_active = !self.soma_active && !self.lyra_active && p.get(TONOS_BASE + TN_ENABLE) > 0.5;
        if self.tonos_active {
            self.tonos.set_sample_rate(sr_hint);
            self.tonos.trigger(midi_to_hz(note), self.velocity, p, &mut self.tonos_rng);
        }
        self.orch_active = !self.soma_active && !self.lyra_active && !self.tonos_active && {
            self.orch.set_sample_rate(sr_hint);
            self.orch.trigger(p, midi_to_hz(note), self.velocity)
        };
        self.volta_active = !self.soma_active
            && !self.lyra_active
            && !self.tonos_active
            && !self.orch_active
            && p.get(VOLTA_BASE + VL_ENABLE) > 0.5;
        if self.volta_active {
            self.volta.set_sample_rate(sr_hint);
            self.volta.trigger(note, p, glide_from);
        }

        if self.modal_active {
            self.modal.reset();
            let spec = modal_spec_for(note, p);
            self.modal.prepare(&spec, sr_hint);
            let xs = exciter_spec(p, self.velocity);
            self.exciter.strike(&xs, sr_hint);
            self.gate_amp = 0.0;
            let swell_t = swell_time_s(p.get(MODAL_BASE + M_SWELL));
            if swell_t > 0.002 {
                self.swell = 0.0;
                self.swell_inc = 1.0 / (swell_t * sr_hint);
            } else {
                self.swell = 1.0;
                self.swell_inc = 1.0;
            }
        }
    }

    pub fn note_off(&mut self) {
        self.released = true;
        if self.volta_active {
            self.volta.release();
        }
        for e in self.envs.iter_mut() {
            e.note_off();
        }
        // Lifting the bow stops feeding the bank; the body keeps ringing on its own, which is
        // the whole difference between releasing a modal voice and muting one.
        self.exciter.release();
    }

    pub fn kill(&mut self) {
        self.active = false;
        for e in self.envs.iter_mut() {
            e.hard_reset();
        }
        self.string.reset();
        self.soma.reset();
        self.lyra.reset();
        self.tonos.reset();
        self.orch.reset();
        self.orch_active = false;
        self.volta.reset();
        self.volta_active = false;
    }

    #[inline]
    pub fn is_finished(&self) -> bool {
        if self.soma_active {
            return self.soma.is_quiet() && !self.sample.is_active();
        }
        if self.lyra_active {
            return self.lyra.is_quiet();
        }
        if self.tonos_active {
            return self.tonos.is_quiet();
        }
        if self.orch_active {
            return self.orch.is_quiet();
        }
        if self.volta_active {
            return self.volta.is_quiet();
        }

        if self.modal_active {
            if self.swell < 1.0 {
                return false;
            }
            if self.modal.is_sustained() {
                if self.released && self.gate_amp < 0.0008 {
                    return true;
                }
                return false;
            }
            return self.exciter.is_idle() && self.modal.is_quiet();
        }
        !self.envs[0].is_active()
    }

    /// Tick per-voice LFOs (for slots with `L_PER_VOICE > 0.5`) and envelopes into `mv`.
    #[inline]
    fn eval_mod_values(
        &mut self,
        p: &Params,
        globals: &ModValues,
        engine_lfos: &[Lfo; NUM_LFO],
        beats_per_sec: f32,
        dt_ctl: f32,
    ) -> ModValues {
        let mut mv = *globals;
        for e in 0..NUM_ENV {
            mv.env[e] = self.envs[e].tick(dt_ctl);
        }
        for i in 0..NUM_LFO {
            if p.get(lfo_param(i, L_PER_VOICE)) > 0.5 {
                let gl = &engine_lfos[i];
                let vl = &mut self.lfos[i];
                vl.shape = gl.shape;
                vl.rate_hz = gl.rate_hz;
                vl.sync_beats = gl.sync_beats;
                vl.bipolar = gl.bipolar;
                vl.retrigger = gl.retrigger;
                vl.fade = gl.fade;
                mv.lfo[i] = vl.tick(dt_ctl, beats_per_sec, &mut self.lfo_rng);
            }
        }
        mv.velocity = self.velocity;
        mv.key_track = (self.note - 60.0) / 48.0;
        mv.pressure = self.expr.pressure;
        mv.timbre = self.expr.timbre;
        mv.pitch_bend = (globals.pitch_bend + self.expr.pitch_bend).clamp(-1.0, 1.0);
        mv.random = self.drift[0];
        mv
    }

    #[allow(clippy::too_many_arguments)]
    fn render_soma(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        globals: &ModValues,
        layout: Layout,
        base_pos: Position,
        bank: &SampleBank,
        sr: f32,
    ) {
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);
        let deep_rate = if self.sample.slot >= 0 {
            bank.get(self.sample.slot as usize).map(|s| s.sample_rate as f64 / sr as f64).unwrap_or(1.0)
        } else {
            1.0
        };

        let bend_range = (p.get(P_BEND_RANGE) * 24.0).max(2.0);
        let total_bend = (globals.pitch_bend + self.expr.pitch_bend).clamp(-1.0, 1.0);
        let pitch_bend_ratio = (2.0f32).powf((total_bend * bend_range) / 12.0);
        let mod_wheel = (globals.mod_wheel + self.expr.pressure + self.expr.timbre * 0.5).clamp(0.0, 1.0);
        let level = p.get(P_MASTER_GAIN).max(0.0);

        for f in 0..frames {
            if self.start_delay > 0 {
                self.start_delay -= 1;
                continue;
            }
            if self.soma_deep_gain > 0.0 {
                let (dl, dr) = self.sample.next(bank, deep_rate, false);
                self.soma.deep_in = [dl * self.soma_deep_gain, dr * self.soma_deep_gain];
            }
            let (yl, yr) = self.soma.render_sample(p, pitch_bend_ratio, mod_wheel, &mut self.soma_rng);
            if !yl.is_finite() || !yr.is_finite() {
                continue;
            }
            if nch >= 2 {
                out[0][f] += yl * level * gains[0] * 1.4142;
                out[1][f] += yr * level * gains[1] * 1.4142;
                for c in 2..nch {
                    out[c][f] += 0.5 * (yl + yr) * level * gains[c];
                }
            } else if nch == 1 {
                out[0][f] += 0.5 * (yl + yr) * level;
            }
        }

        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// Legato into a LYRA voice: a bowed/blown model glides to the new note without a new
    /// attack. Returns false when this isn't a LYRA voice (the caller keeps its own behaviour).
    pub fn lyra_slur(&mut self, note: f32, vel: f32, p: &Params) -> bool {
        if !self.lyra_active {
            return false;
        }
        self.lyra.slur(midi_to_hz(note), vel.clamp(0.0, 1.0), p, &mut self.lyra_rng);
        true
    }

    /// A held, sounding bowed/blown LYRA voice and how long it has sounded (samples).
    pub fn lyra_held(&self) -> Option<u32> {
        (self.active && !self.released && self.lyra_active && self.lyra.is_sustained()).then(|| self.lyra.samples())
    }

    /// Legato into a TONOS voice: the stopping finger slides (bowed: one bow). False when not TONOS.
    pub fn tonos_slur(&mut self, note: f32, vel: f32, p: &Params) -> bool {
        if !self.tonos_active {
            return false;
        }
        self.tonos.slur(midi_to_hz(note), vel.clamp(0.0, 1.0), p, &mut self.tonos_rng);
        true
    }

    /// Bridge force and floors of this voice's TONOS string on its last sample (tests, diagnostics).
    #[cfg(test)]
    pub(crate) fn tonos_probe(&self) -> (f32, f32) {
        (self.tonos.last_bridge_force, self.tonos.last_floor)
    }

    /// Legato into an orchestra-family voice (bowed: one bow, the finger moves). False when not one.
    pub fn orch_slur(&mut self, note: f32, vel: f32, p: &Params) -> bool {
        if !self.orch_active {
            return false;
        }
        self.orch.slur(p, midi_to_hz(note), vel.clamp(0.0, 1.0));
        true
    }

    /// A held, sounding, sustained orchestra-family voice and how long it has sounded (samples).
    pub fn orch_held(&self) -> Option<u32> {
        (self.active && !self.released && self.orch_active && self.orch.is_sustained()).then(|| self.orch.samples())
    }

    /// A held orchestra-family voice of `kind` that started within `max_age` samples: its note.
    pub fn orch_recent(&self, kind: u8, max_age: u32) -> Option<f32> {
        (self.orch_held_kind(kind) && self.orch.samples() <= max_age).then_some(self.note)
    }
    pub fn orch_held_kind(&self, kind: u8) -> bool {
        self.active && !self.released && self.orch_active && self.orch.kind() == kind
    }

    /// Restart this voice's note under a new role (ensembles re-voice a chord as it arrives).
    pub fn orch_retrigger(&mut self, p: &Params) {
        if self.orch_active {
            let hz = midi_to_hz(self.note);
            self.orch.trigger(p, hz, self.velocity);
        }
    }

    pub fn tonos_held(&self) -> Option<u32> {
        (self.active && !self.released && self.tonos_active).then(|| self.tonos.samples())
    }

    /// The TONOS render path: the string's own physics is the envelope.
    #[allow(clippy::too_many_arguments)]
    fn render_tonos(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        globals: &ModValues,
        layout: Layout,
        base_pos: Position,
        bank: &SampleBank,
        sr: f32,
    ) {
        let deep_rate = if self.sample.slot >= 0 {
            bank.get(self.sample.slot as usize).map(|s| s.sample_rate as f64 / sr as f64).unwrap_or(1.0)
        } else {
            1.0
        };
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);
        if self.released {
            self.tonos.release();
        }
        self.tonos.update_live(p);
        let bend_range = (p.get(P_BEND_RANGE) * 24.0).max(2.0);
        let total_bend = (globals.pitch_bend + self.expr.pitch_bend).clamp(-1.0, 1.0);
        let bend = (2.0f32).powf((total_bend * bend_range) / 12.0);
        let mod_wheel = (globals.mod_wheel + self.expr.pressure + self.expr.timbre * 0.5).clamp(0.0, 1.0);
        let level = p.get(P_MASTER_GAIN).max(0.0);
        for f in 0..frames {
            if self.start_delay > 0 {
                self.start_delay -= 1;
                continue;
            }
            if self.soma_deep_gain > 0.0 {
                if self.tonos.deep_active() {
                    let (dl, dr) = self.sample.next(bank, deep_rate, false);
                    self.tonos.feed_deep(dl * self.soma_deep_gain, dr * self.soma_deep_gain);
                } else {
                    self.soma_deep_gain = 0.0;
                    self.tonos.feed_deep(0.0, 0.0);
                }
            }
            let (yl, yr) = self.tonos.render_sample(bend, mod_wheel, &mut self.tonos_rng);
            if nch >= 2 {
                out[0][f] += yl * level * gains[0] * 1.4142;
                out[1][f] += yr * level * gains[1] * 1.4142;
                for c in 2..nch {
                    out[c][f] += 0.5 * (yl + yr) * level * gains[c];
                }
            } else if nch == 1 {
                out[0][f] += 0.5 * (yl + yr) * level;
            }
        }
        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// Exposed circuit-node telemetry for VOLTA voices (`[vco, wavefold, ladder, svf, diode, rail, temp]`).
    pub fn volta_probes(&self) -> Option<&[f32; VOLTA_PROBE_COUNT]> {
        (self.active && self.volta_active).then_some(&self.volta.probes)
    }

    pub fn volta_slur(&mut self, note: f32, p: &Params) -> bool {
        if !self.volta_active {
            return false;
        }
        self.note = note;
        self.volta.slur(note, p);
        true
    }

    #[allow(clippy::too_many_arguments)]
    fn render_volta(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        matrix: &ModMatrix,
        globals: &ModValues,
        engine_lfos: &[Lfo; NUM_LFO],
        beats_per_sec: f32,
        sr: f32,
        layout: Layout,
        base_pos: Position,
    ) {
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);
        let dt_blk = (frames as f32) / sr.max(1.0);
        let mv = self.eval_mod_values(p, globals, engine_lfos, beats_per_sec, dt_blk);
        let total_bend = mv.pitch_bend;
        self.volta.render(
            out,
            frames,
            self.note,
            self.velocity,
            self.released,
            &mut self.start_delay,
            p,
            matrix,
            &mv,
            &gains,
            nch,
            total_bend,
        );
        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// The orchestra-family render path: the model's physics is the envelope; bridge forces go to
    /// the deep-body bus.
    #[allow(clippy::too_many_arguments)]
    fn render_orch(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        globals: &ModValues,
        layout: Layout,
        base_pos: Position,
        mut bus: Option<&mut [[f32; crate::engine::MAX_BLOCK]; crate::arco::NBUS]>,
    ) {
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);
        if self.released {
            self.orch.release();
        }
        let bend_range = (p.get(P_BEND_RANGE) * 24.0).max(2.0);
        let total_bend = (globals.pitch_bend + self.expr.pitch_bend).clamp(-1.0, 1.0);
        let bend = (2.0f32).powf((total_bend * bend_range) / 12.0);
        let mod_wheel = (globals.mod_wheel + self.expr.pressure + self.expr.timbre * 0.5).clamp(0.0, 1.0);
        let level = p.get(P_MASTER_GAIN).max(0.0);
        for f in 0..frames {
            if self.start_delay > 0 {
                self.start_delay -= 1;
                continue;
            }
            let (yl, yr, bi, force) = self.orch.render_sample(bend, mod_wheel);
            if let Some(b) = bus.as_deref_mut() {
                b[bi][f] += force * level;
            }
            if nch >= 2 {
                out[0][f] += yl * level * gains[0] * 1.4142;
                out[1][f] += yr * level * gains[1] * 1.4142;
                for c in 2..nch {
                    out[c][f] += 0.5 * (yl + yr) * level * gains[c];
                }
            } else if nch == 1 {
                out[0][f] += 0.5 * (yl + yr) * level;
            }
        }
        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// The LYRA render path: like SOMA, the model's own physics is the envelope.
    fn render_lyra(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        globals: &ModValues,
        layout: Layout,
        base_pos: Position,
    ) {
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);
        if self.released {
            self.lyra.release(p);
        }
        self.lyra.update_live(p);
        let bend_range = (p.get(P_BEND_RANGE) * 24.0).max(2.0);
        let total_bend = (globals.pitch_bend + self.expr.pitch_bend).clamp(-1.0, 1.0);
        let bend = (2.0f32).powf((total_bend * bend_range) / 12.0);
        let mod_wheel = (globals.mod_wheel + self.expr.pressure + self.expr.timbre * 0.5).clamp(0.0, 1.0);
        let level = p.get(P_MASTER_GAIN).max(0.0);
        for f in 0..frames {
            if self.start_delay > 0 {
                self.start_delay -= 1;
                continue;
            }
            let (yl, yr) = self.lyra.render_sample(bend, mod_wheel, &mut self.lyra_rng);
            if !yl.is_finite() || !yr.is_finite() {
                continue;
            }
            if nch >= 2 {
                out[0][f] += yl * level * gains[0] * 1.4142;
                out[1][f] += yr * level * gains[1] * 1.4142;
                for c in 2..nch {
                    out[c][f] += 0.5 * (yl + yr) * level * gains[c];
                }
            } else if nch == 1 {
                out[0][f] += 0.5 * (yl + yr) * level;
            }
        }
        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// The VELA / CANTUS / ISON / PNEUMA modal render path with live modulation matrix,
    /// per-voice LFOs, pitch bend, glide, Mod Wheel, and MPE pressure/slide support.
    #[allow(clippy::too_many_arguments)]
    fn render_modal(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        matrix: &ModMatrix,
        globals: &ModValues,
        engine_lfos: &[Lfo; NUM_LFO],
        beats_per_sec: f32,
        sr: f32,
        layout: Layout,
        base_pos: Position,
    ) {
        let nch = layout.channels();
        let dt = 1.0 / sr;
        let bend_range = p.get(P_BEND_RANGE) * 24.0;
        let sustained = p.get(MODAL_BASE + M_MODE) as u32 != 0;
        // Release length scales with the Veil so a big patch does not snap shut. 0.4-3 s.
        let rel_k = 1.0 / ((0.4 + p.get(VEIL_BASE + V_DECAY) * 2.6) * sr);

        let mut frame = 0usize;
        while frame < frames {
            let n = CONTROL_BLOCK.min(frames - frame);
            let dt_ctl = dt * (n as f32);
            let mv = self.eval_mod_values(p, globals, engine_lfos, beats_per_sec, dt_ctl);

            let glide_time = (p.get(P_GLIDE) + matrix.amount_for(P_GLIDE, &mv)).clamp(0.0, 1.0) * 2.0;
            if glide_time > 0.0005 {
                let k = 1.0 - (-dt_ctl / glide_time).exp();
                self.glide_note += (self.note - self.glide_note) * k;
            } else {
                self.glide_note = self.note;
            }

            let pitch_mod = matrix.amount_for(osc_param(0, O_COARSE), &mv) * 24.0
                + matrix.amount_for(osc_param(0, O_FINE), &mv) * 2.0;
            let eff_note = self.glide_note + mv.pitch_bend * bend_range + pitch_mod;

            let spec = modal_spec_modulated(eff_note, p, matrix, &mv);
            self.modal.update_spec(&spec);

            let xs = exciter_spec_modulated(p, self.velocity, matrix, &mv);
            let gate = !self.released && (sustained || xs.kind.is_continuous());
            let drive = if xs.kind.is_continuous() { self.modal.sustain_scale() } else { 1.0 };

            let master_gain = (p.get(P_MASTER_GAIN) + matrix.amount_for(P_MASTER_GAIN, &mv)).max(0.0);
            let level = (0.35 + 0.65 * self.velocity) * master_gain;

            let az_mod = matrix.amount_for(P_UNISON_WIDTH, &mv) * 0.8
                + (matrix.amount_for(osc_param(0, O_PAN), &mv)) * core::f32::consts::FRAC_PI_2;
            let pos = if az_mod.abs() > 1e-4 {
                Position::from_polar(base_pos.azimuth() + az_mod, base_pos.elevation(), base_pos.distance())
            } else {
                base_pos
            };
            let mut gains = [0.0f32; MAX_CHANNELS];
            pan_gains(pos, layout, 0.0, &mut gains);

            for s in 0..n {
                let idx = frame + s;
                if self.start_delay > 0 {
                    self.start_delay -= 1;
                    continue;
                }
                if self.swell < 1.0 {
                    self.swell = (self.swell + self.swell_inc).min(1.0);
                }
                let target = if self.released { 0.0 } else { 1.0 };
                self.gate_amp += (target - self.gate_amp) * rel_k * 4.0;
                let swell = self.swell * self.swell * (3.0 - 2.0 * self.swell);
                let x = self.exciter.process(&xs, gate, sr) * drive;
                let driven = if sustained { self.gate_amp } else { 1.0 };
                let y = self.modal.process_coupled(x, matches!(xs.kind, crate::exciter::ExciterType::Blow)) * level * swell * driven;
                if !y.is_finite() {
                    continue;
                }
                for c in 0..nch {
                    out[c][idx] += y * gains[c];
                }
            }

            frame += n;
        }

        self.age += frames as u64;
        if self.is_finished() {
            self.active = false;
        }
    }

    /// Render into an interleaved-by-channel scratch: `out[ch][frame]`.
    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        matrix: &ModMatrix,
        globals: &ModValues,
        engine_lfos: &[Lfo; NUM_LFO],
        beats_per_sec: f32,
        tables: &[WaveTable],
        bank: &SampleBank,
        sr: f32,
        layout: Layout,
        base_pos: Position,
        wf: &WobbleFrame,
        bus: Option<&mut [[f32; crate::engine::MAX_BLOCK]; crate::arco::NBUS]>,
    ) {
        if !self.active {
            return;
        }
        if self.orch_active {
            self.render_orch(out, frames, p, globals, layout, base_pos, bus);
            return;
        }
        if self.volta_active {
            self.render_volta(out, frames, p, matrix, globals, engine_lfos, beats_per_sec, sr, layout, base_pos);
            return;
        }
        if self.soma_active {
            self.render_soma(out, frames, p, globals, layout, base_pos, bank, sr);
            return;
        }
        if self.lyra_active {
            self.render_lyra(out, frames, p, globals, layout, base_pos);
            return;
        }
        if self.tonos_active {
            self.render_tonos(out, frames, p, globals, layout, base_pos, bank, sr);
            return;
        }
        if self.modal_active {
            self.render_modal(out, frames, p, matrix, globals, engine_lfos, beats_per_sec, sr, layout, base_pos);
            return;
        }

        let dt = 1.0 / sr;
        let bend_range = p.get(P_BEND_RANGE) * 24.0;
        let base_drift_amt = p.get(P_ANALOG_DRIFT);

        let uni_count = (1.0 + p.get(P_UNISON_COUNT) * 15.0).round().clamp(1.0, MAX_UNISON as f32) as usize;
        let base_uni_detune = p.get(P_UNISON_DETUNE);
        let uni_width = p.get(P_UNISON_WIDTH);
        let base_uni_blend = p.get(P_UNISON_BLEND);

        let mut frame = 0usize;
        while frame < frames {
            let n = CONTROL_BLOCK.min(frames - frame);
            let dt_ctl = dt * (CONTROL_BLOCK as f32);

            // ── control rate: envelopes, per-voice LFOs, mod values, resolved parameters ──
            let mv = self.eval_mod_values(p, globals, engine_lfos, beats_per_sec, dt_ctl);
            let total_bend = mv.pitch_bend;

            // Live ADSR modulation when any envelope parameter is targeted in the mod matrix.
            for e in 0..NUM_ENV {
                let ma = matrix.amount_for(env_param(e, E_ATTACK), &mv);
                let md = matrix.amount_for(env_param(e, E_DECAY), &mv);
                let ms = matrix.amount_for(env_param(e, E_SUSTAIN), &mv);
                let mr = matrix.amount_for(env_param(e, E_RELEASE), &mv);
                if ma.abs() > 1e-5 || md.abs() > 1e-5 || ms.abs() > 1e-5 || mr.abs() > 1e-5 {
                    self.envs[e].set_adsr(
                        env_time((p.get(env_param(e, E_ATTACK)) + ma).clamp(0.0, 1.0)),
                        env_time((p.get(env_param(e, E_DECAY)) + md).clamp(0.0, 1.0)),
                        (p.get(env_param(e, E_SUSTAIN)) + ms).clamp(0.0, 1.0),
                        env_time((p.get(env_param(e, E_RELEASE)) + mr).clamp(0.0, 1.0)),
                    );
                }
            }

            let glide_time = (p.get(P_GLIDE) + matrix.amount_for(P_GLIDE, &mv)).clamp(0.0, 1.0) * 2.0;
            if glide_time > 0.0005 {
                let k = 1.0 - (-dt_ctl / glide_time).exp();
                self.glide_note += (self.note - self.glide_note) * k;
            } else {
                self.glide_note = self.note;
            }

            let drift_amt = (base_drift_amt + matrix.amount_for(P_ANALOG_DRIFT, &mv)).clamp(0.0, 1.0);
            let uni_detune = (base_uni_detune + matrix.amount_for(P_UNISON_DETUNE, &mv)).clamp(0.0, 1.0);
            let uni_blend = (base_uni_blend + matrix.amount_for(P_UNISON_BLEND, &mv)).clamp(0.0, 1.0);

            // ── BAJO wobble ──────────────────────────────────────────────────────
            let wob = if wf.on {
                let raw = wob_eval(wf.phase + wf.inc * frame as f32, wf.shape, wf.skew);
                self.wob_smooth += (raw - self.wob_smooth) * wf.smooth;
                if wf.smooth >= 1.0 { raw } else { self.wob_smooth }
            } else {
                0.0
            };
            let wob_cut = wob * wf.depth_for(WOB_DEST_CUTOFF);
            let wob_pitch = wob * wf.depth_for(WOB_DEST_PITCH);
            let wob_morph = wob * wf.depth_for(WOB_DEST_MORPH);
            let wob_reso = wob * wf.depth_for(WOB_DEST_RESO);

            // ── AURA & ONDA per-voice vintage component tolerances & Generative Flux ──
            let sync_amt = (p.get(AURA_BASE + A_OSC_SYNC) + matrix.amount_for(AURA_BASE + A_OSC_SYNC, &mv)).clamp(0.0, 1.0);
            let mut xmod_pitch = (p.get(AURA_BASE + A_XMOD_PITCH) + matrix.amount_for(AURA_BASE + A_XMOD_PITCH, &mv)).clamp(0.0, 1.0);
            let mut xmod_flt = (p.get(AURA_BASE + A_XMOD_FILTER) + matrix.amount_for(AURA_BASE + A_XMOD_FILTER, &mv)).clamp(0.0, 1.0);
            let mut ring_amt = (p.get(AURA_BASE + A_RING_MOD) + matrix.amount_for(AURA_BASE + A_RING_MOD, &mv)).clamp(0.0, 1.0);
            let aura_amt = (p.get(AURA_BASE + A_AURA) + matrix.amount_for(AURA_BASE + A_AURA, &mv)).clamp(0.0, 1.0);
            let warmth_amt = (p.get(AURA_BASE + A_WARMTH) + matrix.amount_for(AURA_BASE + A_WARMTH, &mv) + drift_amt * 0.14).clamp(0.0, 1.0);

            let flux_on = p.get(AURA_BASE + A_FLUX_ON) > 0.5;
            let flux_amt = if flux_on {
                (p.get(AURA_BASE + A_FLUX_AMT) + matrix.amount_for(AURA_BASE + A_FLUX_AMT, &mv)).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let flux_rate = p.get(AURA_BASE + A_FLUX_RATE).clamp(0.0, 1.0);
            let flux_mode = p.get(AURA_BASE + A_FLUX_MODE).round().max(0.0) as u32;

            let (flux_cut_mod, flux_res_mod, flux_pan_mod, flux_pitch_semi, flux_morph_mod, flux_osc2_semi) =
                if flux_amt > 0.0005 {
                    let sh_hz = 0.75 * (22.0f32).powf(flux_rate);
                    self.sh_phase += sh_hz * dt_ctl;
                    if self.sh_phase >= 1.0 {
                        self.sh_phase -= 1.0;
                        self.sh_target = [
                            self.aura_rng.bipolar(),
                            self.aura_rng.bipolar(),
                            self.aura_rng.bipolar(),
                        ];
                    }
                    let slew_k = match flux_mode {
                        0 => 0.48,  // Mode 0: Snappy Sample & Hold steps (ARP 2600 / EMS VCS3)
                        1 => 0.028, // Mode 1: Buchla 266 Smooth Fluctuating Random Voltages
                        _ => 0.35,  // Mode 2: Cosmic Glitch harmonic stepper
                    };
                    for i in 0..3 {
                        self.sh_slew[i] += (self.sh_target[i] - self.sh_slew[i]) * slew_k;
                    }
                    let c_note = self.note_rand[0] * 0.16 * flux_amt;
                    let p_note = self.note_rand[1] * 0.35 * flux_amt;
                    match flux_mode {
                        0 => (
                            c_note + self.sh_slew[0] * 0.36 * flux_amt,
                            self.sh_slew[0].abs() * 0.28 * flux_amt,
                            p_note + self.sh_slew[1] * 0.55 * flux_amt,
                            self.note_rand[2] * 0.08 * flux_amt,
                            self.sh_slew[2] * 0.25 * flux_amt,
                            0.0,
                        ),
                        1 => (
                            c_note + self.sh_slew[0] * 0.30 * flux_amt,
                            self.sh_slew[0].max(0.0) * 0.18 * flux_amt,
                            p_note + self.sh_slew[1] * 0.48 * flux_amt,
                            self.sh_slew[2] * 0.38 * flux_amt,
                            self.sh_slew[1] * 0.38 * flux_amt,
                            0.0,
                        ),
                        _ => {
                            const HARM_STEPS: [f32; 6] = [-12.0, 0.0, 7.0, 12.0, 19.0, 24.0];
                            let idx = (((self.sh_target[2] * 0.5 + 0.5) * 5.99) as usize).min(5);
                            ring_amt = (ring_amt + self.sh_slew[0].max(0.0) * 0.45 * flux_amt).clamp(0.0, 1.0);
                            xmod_flt = (xmod_flt + self.sh_slew[1].abs() * 0.35 * flux_amt).clamp(0.0, 1.0);
                            (
                                c_note + self.sh_slew[0] * 0.28 * flux_amt,
                                0.22 * flux_amt,
                                p_note + self.sh_slew[1] * 0.6 * flux_amt,
                                0.0,
                                self.sh_slew[0] * 0.35 * flux_amt,
                                HARM_STEPS[idx],
                            )
                        }
                    }
                } else {
                    (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
                };

            let xmod_active = sync_amt > 0.0005 || xmod_pitch > 0.0005 || xmod_flt > 0.0005 || ring_amt > 0.0005;

            let tol_active = aura_amt > 0.0005 || drift_amt > 0.0005;
            let (aura_pitch_semi, aura_cut_scale, aura_res_tol, aura_pw_tol) = if tol_active {
                self.thermal_walk = (self.thermal_walk * 0.9985 + self.aura_rng.bipolar() * 0.012).clamp(-1.0, 1.0);
                let p_semi = (self.card_tol[0] * 0.22 + self.thermal_walk * 0.14) * aura_amt
                    + self.thermal_walk * 0.05 * drift_amt;
                let c_scale = (1.0
                    + (self.card_tol[1] * 0.16 + self.thermal_walk * 0.08) * aura_amt
                    + (self.card_tol[1] * 0.06 + self.thermal_walk * 0.03) * drift_amt)
                    .clamp(0.72, 1.32);
                let r_tol = self.card_tol[2] * (0.05 * aura_amt + 0.025 * drift_amt);
                let pw_tol = self.card_tol[0] * (0.035 * aura_amt + 0.02 * drift_amt);
                (p_semi, c_scale, r_tol, pw_tol)
            } else {
                (0.0, 1.0, 0.0, 0.0)
            };

            // Built-in Vintage Mod Wheel Expression: LFO 0 vibrato + filter shimmer + PWM
            let mw = mv.mod_wheel.clamp(0.0, 1.0);
            let mw_vibrato_semi = if mw > 0.001 { mv.lfo[0] * mw * 0.55 } else { 0.0 };
            let mw_cut_mod = if mw > 0.001 { mw * 0.18 + mv.lfo[0] * mw * 0.14 } else { 0.0 };
            let mw_timbre_mod = if mw > 0.001 { mv.lfo[0] * mw * 0.22 } else { 0.0 };
            if mw > 0.05 && xmod_active {
                xmod_pitch = (xmod_pitch + mw * 0.18).clamp(0.0, 1.0);
            }

            let bent = self.glide_note
                + total_bend * bend_range
                + wob_pitch * 12.0
                + aura_pitch_semi
                + mw_vibrato_semi
                + flux_pitch_semi;

            // Filters (including live modulation on drive, env amount, keytrack, and dry/wet mix)
            let mut cut = [0.0f32; 2];
            let mut res = [0.0f32; 2];
            let mut drv = [0.0f32; 2];
            let mut f_mix = [1.0f32; 2];
            let mut is_ladder = [true; 2];
            let mut svf_mode = [SvfMode::Low; 2];
            let mut f_on = [false; 2];
            for f in 0..2 {
                f_on[f] = p.get(flt_param(f, F_ENABLE)) > 0.5;
                let base = p.get(flt_param(f, F_CUTOFF));
                let m = matrix.amount_for(flt_param(f, F_CUTOFF), &mv);
                let kt_amt = (p.get(flt_param(f, F_KEYTRACK)) + matrix.amount_for(flt_param(f, F_KEYTRACK), &mv)).clamp(0.0, 1.0);
                let kt = kt_amt * (self.note - 60.0) / 60.0;
                let env_amt_norm = (p.get(flt_param(f, F_ENV_AMT)) + matrix.amount_for(flt_param(f, F_ENV_AMT), &mv)).clamp(0.0, 1.0);
                let envamt = (env_amt_norm - 0.5) * 2.0 * mv.env[1];
                let target = cutoff_hz((base + m + kt + envamt + mw_cut_mod + flux_cut_mod).clamp(0.0, 1.0)) * aura_cut_scale;
                self.cutoff_smooth[f] += (target - self.cutoff_smooth[f]) * 0.35;
                cut[f] = (self.cutoff_smooth[f] * (2.0f32).powf(wob_cut * 4.0)).clamp(20.0, 20000.0);
                res[f] = (p.get(flt_param(f, F_RES))
                    + matrix.amount_for(flt_param(f, F_RES), &mv)
                    + wob_reso * 0.5
                    + flux_res_mod
                    + aura_res_tol)
                    .clamp(0.0, 1.0);
                drv[f] = (p.get(flt_param(f, F_DRIVE)) + matrix.amount_for(flt_param(f, F_DRIVE), &mv)).clamp(0.0, 1.0);
                f_mix[f] = (p.get(flt_param(f, F_MIX)) + matrix.amount_for(flt_param(f, F_MIX), &mv)).clamp(0.0, 1.0);
                is_ladder[f] = p.get(flt_param(f, F_TYPE)) < 0.5;
                svf_mode[f] = SvfMode::from_index(p.get(flt_param(f, F_MODE)) as u32);
            }
            let parallel = p.get(P_FILTER_ROUTING) > 0.5;

            // Spatial unison spread + per-oscillator stereo/azimuth pan (`O_PAN`)
            let spread_mod = matrix.amount_for(P_UNISON_WIDTH, &mv);
            let width = (uni_width + spread_mod).clamp(0.0, 1.0);
            let mut uni_gains = [[0.0f32; MAX_CHANNELS]; MAX_UNISON];
            let base_az = base_pos.azimuth() + flux_pan_mod;
            let base_el = base_pos.elevation();
            let base_dist = base_pos.distance();
            for u in 0..uni_count {
                let off = if uni_count > 1 {
                    (u as f32 / (uni_count - 1) as f32 * 2.0 - 1.0) * width * 0.8
                } else {
                    0.0
                };
                let pos = Position::from_polar(base_az + off, base_el, base_dist);
                let mut g = [0.0f32; MAX_CHANNELS];
                pan_gains(pos, layout, 0.0, &mut g);
                uni_gains[u] = g;
            }

            // Oscillator parameters
            let mut o_on = [false; NUM_OSC];
            let mut o_lvl = [0.0f32; NUM_OSC];
            let mut o_inc = [0.0f32; NUM_OSC];
            let mut o_morph = [0.0f32; NUM_OSC];
            let mut o_wavetable = [true; NUM_OSC];
            let mut o_shape = [AnalogShape::Saw; NUM_OSC];
            let mut o_pw = [0.5f32; NUM_OSC];
            let mut o_table = [0usize; NUM_OSC];
            let mut o_drive = [0.0f32; NUM_OSC];
            let mut o_drive_mode = [ShapeMode::Off; NUM_OSC];
            let mut osc_uni_gains = [uni_gains; NUM_OSC];

            for o in 0..NUM_OSC {
                o_on[o] = p.get(osc_param(o, O_ENABLE)) > 0.5 || (xmod_active && o < 2);
                if !o_on[o] {
                    continue;
                }
                let raw_en = p.get(osc_param(o, O_ENABLE)) > 0.5;
                let base_lvl = if raw_en {
                    (p.get(osc_param(o, O_LEVEL)) + matrix.amount_for(osc_param(o, O_LEVEL), &mv)).clamp(0.0, 1.5)
                } else {
                    0.0
                };
                o_lvl[o] = if o == 1 && sync_amt > 0.0005 {
                    base_lvl.max(sync_amt * 0.78)
                } else {
                    base_lvl
                };
                let mut coarse = (p.get(osc_param(o, O_COARSE)) - 0.5) * 48.0;
                let fine = (p.get(osc_param(o, O_FINE)) - 0.5) * 2.0
                    + matrix.amount_for(osc_param(o, O_FINE), &mv) * 2.0; // ±1 st knob + ±2 st mod
                if o == 1 {
                    if sync_amt > 0.0005 {
                        if coarse.abs() < 0.5 {
                            coarse += 7.0 + sync_amt * 10.0;
                        }
                        coarse += mv.env[1] * sync_amt * 14.0;
                    } else if (xmod_pitch > 0.0005 || xmod_flt > 0.0005 || ring_amt > 0.0005)
                        && coarse.abs() < 0.1
                        && fine.abs() < 0.05
                    {
                        coarse += 7.02;
                    }
                    coarse += flux_osc2_semi;
                }
                let drift = self.drift[o] * drift_amt * 0.10;
                let semis = bent + coarse + fine + drift
                    + matrix.amount_for(osc_param(o, O_COARSE), &mv) * 24.0;
                o_inc[o] = midi_to_hz(semis) / sr;
                o_morph[o] = (p.get(osc_param(o, O_MORPH)) + matrix.amount_for(osc_param(o, O_MORPH), &mv)
                    + wob_morph * 0.5 + mw_timbre_mod + flux_morph_mod).clamp(0.0, 1.0);
                o_wavetable[o] = p.get(osc_param(o, O_MODE)) < 0.5;
                o_shape[o] = AnalogShape::from_index(p.get(osc_param(o, O_ANALOG_SHAPE)) as u32);
                o_pw[o] = (p.get(osc_param(o, O_PULSE_WIDTH))
                    + matrix.amount_for(osc_param(o, O_PULSE_WIDTH), &mv)
                    + mw_timbre_mod
                    + flux_morph_mod * 0.5
                    + aura_pw_tol)
                    .clamp(0.05, 0.95);
                o_table[o] = (p.get(osc_param(o, O_TABLE)) as usize).min(tables.len().saturating_sub(1));
                o_drive[o] = (p.get(osc_param(o, O_DRIVE)) + matrix.amount_for(osc_param(o, O_DRIVE), &mv)).clamp(0.0, 1.0);
                o_drive_mode[o] = ShapeMode::from_index(p.get(osc_param(o, O_DRIVE_MODE)) as u32);

                let pan_norm = (p.get(osc_param(o, O_PAN)) + matrix.amount_for(osc_param(o, O_PAN), &mv)).clamp(0.0, 1.0);
                let pan_bipolar = (pan_norm - 0.5) * 2.0;
                if pan_bipolar.abs() > 1e-4 {
                    let pan_az = pan_bipolar * (core::f32::consts::FRAC_PI_2 * 0.85);
                    for u in 0..uni_count {
                        let off = if uni_count > 1 {
                            (u as f32 / (uni_count - 1) as f32 * 2.0 - 1.0) * width * 0.8
                        } else {
                            0.0
                        };
                        let pos = Position::from_polar(base_az + off + pan_az, base_el, base_dist);
                        let mut g = [0.0f32; MAX_CHANNELS];
                        pan_gains(pos, layout, 0.0, &mut g);
                        osc_uni_gains[o][u] = g;
                    }
                }
            }

            let sub_lvl = (p.get(P_SUB_LEVEL) + matrix.amount_for(P_SUB_LEVEL, &mv)).clamp(0.0, 1.0);
            let sub_oct = if p.get(P_SUB_OCTAVE) > 0.5 { 2.0 } else { 1.0 };
            let sub_inc = midi_to_hz(bent - 12.0 * sub_oct) / sr;
            let sub_shape = AnalogShape::from_index(p.get(P_SUB_SHAPE) as u32);
            let noise_lvl = (p.get(P_NOISE_LEVEL) + matrix.amount_for(P_NOISE_LEVEL, &mv)).clamp(0.0, 1.0);
            let noise_pink = p.get(P_NOISE_COLOR) > 0.5;

            let str_lvl = p.get(STR_BASE + S_LEVEL);
            let str_hz = midi_to_hz(bent);
            let str_damp = p.get(STR_BASE + S_DAMP);
            let str_tone = p.get(STR_BASE + S_TONE);
            let str_bow = p.get(STR_BASE + S_BOW);
            let str_body = p.get(STR_BASE + S_BODY);
            let str_pick = p.get(STR_BASE + S_PICK);

            let amp_target = mv.env[0]
                * (0.25 + 0.75 * self.velocity)
                * (p.get(P_MASTER_GAIN) + matrix.amount_for(P_MASTER_GAIN, &mv)).clamp(0.0, 1.5);

            // Centre voice keeps full level; the detuned ones are scaled by blend.
            let mut uni_level = [1.0f32; MAX_UNISON];
            if uni_count > 1 {
                let centre = (uni_count - 1) / 2;
                for (u, lv) in uni_level.iter_mut().enumerate().take(uni_count) {
                    *lv = if u == centre { 1.0 } else { uni_blend };
                }
                let norm = 1.0 / (uni_count as f32).sqrt();
                for lv in uni_level.iter_mut().take(uni_count) {
                    *lv *= norm;
                }
            }

            let nch = layout.channels();

            // ── audio rate ────────────────────────────────────────────────────────
            for s in 0..n {
                let idx = frame + s;
                if self.start_delay > 0 {
                    self.start_delay -= 1;
                    continue;
                }
                self.amp_smooth += (amp_target - self.amp_smooth) * 0.02;

                let mut ch_acc = [0.0f32; MAX_CHANNELS];

                // ── sample source (KERA): replaces the oscillators, keeps everything downstream ──
                if self.sample.slot >= 0 {
                    let root = bank.get(self.sample.slot as usize).map(|s| s.root_note).unwrap_or(60.0);
                    let native = bank.get(self.sample.slot as usize).map(|s| s.sample_rate).unwrap_or(sr);
                    let semis = bent - root + self.sample_detune / 100.0;
                    let rate = (2.0f32).powf(semis / 12.0) as f64 * (native as f64 / sr as f64);
                    let (sl, sr_ch) = self.sample.next(bank, rate, self.released);
                    let g = &uni_gains[uni_count / 2];
                    if bank.get(self.sample.slot as usize).map(|s| s.channels.len() > 1).unwrap_or(false) {
                        for c in 0..nch {
                            let s_ch = if c == 0 { sl } else if c == 1 { sr_ch } else { (sl + sr_ch) * 0.5 };
                            ch_acc[c] += s_ch * g[c].max(0.5);
                        }
                    } else {
                        for c in 0..nch {
                            ch_acc[c] += sl * g[c];
                        }
                    }
                    if !self.sample.is_active() && !self.released {
                        self.released = true;
                        for e in self.envs.iter_mut() {
                            e.note_off();
                        }
                    }
                    for c in 0..nch {
                        let x = ch_acc[c];
                        let mut y = x;
                        if f_on[0] {
                            let wet0 = if is_ladder[0] {
                                self.ladders[0][c].process(x, cut[0], res[0], drv[0], sr)
                            } else {
                                self.svfs[0][c].process(x, cut[0], res[0], sr, svf_mode[0])
                            };
                            y = x + (wet0 - x) * f_mix[0];
                        }
                        if f_on[1] {
                            let input2 = if parallel { x } else { y };
                            let wet1 = if is_ladder[1] {
                                self.ladders[1][c].process(input2, cut[1], res[1], drv[1], sr)
                            } else {
                                self.svfs[1][c].process(input2, cut[1], res[1], sr, svf_mode[1])
                            };
                            let y2 = input2 + (wet1 - input2) * f_mix[1];
                            y = if parallel { (y + y2) * 0.7071 } else { y2 };
                        }
                        out[c][idx] += y * self.amp_smooth;
                    }
                    continue;
                }

                let mut osc2_filter_mod = 0.0f32;
                if xmod_active {
                    let mut raw0_stack = [0.0f32; MAX_UNISON];
                    let mut raw1_stack = [0.0f32; MAX_UNISON];
                    let t0 = &tables[o_table[0]];
                    let t1 = &tables[o_table[1]];

                    for u in 0..uni_count {
                        let det = unison_detune_curve(u, uni_count) * uni_detune * 0.14;
                        let fm_mult = if xmod_pitch > 0.0005 {
                            (2.0f32).powf(self.last_osc2[u] * xmod_pitch * 2.5)
                        } else {
                            1.0
                        };
                        let inc0 = (o_inc[0] * (1.0 + det) * fm_mult).clamp(0.0, 0.48);
                        let inc1 = (o_inc[1] * (1.0 + det)).clamp(0.0, 0.48);

                        let prev_ph0 = self.phasors[0][u].phase;
                        let r0 = if o_wavetable[0] {
                            self.phasors[0][u].wavetable(t0, o_morph[0], inc0)
                        } else {
                            self.phasors[0][u].analog(o_shape[0], inc0, o_pw[0])
                        };
                        raw0_stack[u] = r0;

                        // Subsample Hard / Soft Oscillator Sync with PolyBLEP step anti-aliasing
                        let mut sync_blep = 0.0f32;
                        if sync_amt > 0.0005 && prev_ph0 + inc0 >= 1.0 {
                            let frac_after_wrap = ((prev_ph0 + inc0 - 1.0) / inc0.max(1e-6)).clamp(0.0, 1.0);
                            let pre_sync_ph1 = (self.phasors[1][u].phase + inc1 * (1.0 - frac_after_wrap)).fract();
                            let synced_ph = (frac_after_wrap * inc1).fract();
                            self.phasors[1][u].sync_reset(
                                frac_after_wrap * sync_amt,
                                inc1,
                                self.phasors[1][u].phase * (1.0 - sync_amt),
                            );
                            if !o_wavetable[1] {
                                // Scale the PolyBLEP residual by the instantaneous waveform jump height
                                let jump = pre_sync_ph1 * sync_amt;
                                sync_blep = -jump * poly_blep(synced_ph, inc0.max(1e-5));
                            }
                        }

                        let r1 = if o_wavetable[1] {
                            self.phasors[1][u].wavetable(t1, o_morph[1], inc1)
                        } else {
                            self.phasors[1][u].analog(o_shape[1], inc1, o_pw[1]) + sync_blep
                        };
                        raw1_stack[u] = r1;
                        self.last_osc2[u] = r1;
                        osc2_filter_mod += r1 * uni_level[u];
                    }

                    for o in 0..2 {
                        if o_lvl[o] > 0.0001 {
                            let mut osc_sum = 0.0f32;
                            for u in 0..uni_count {
                                let raw = if o == 0 { raw0_stack[u] } else { raw1_stack[u] };
                                let v = raw * o_lvl[o] * uni_level[u];
                                let g = &osc_uni_gains[o][u];
                                for c in 0..nch {
                                    ch_acc[c] += v * g[c];
                                }
                                osc_sum += v;
                            }
                            if o_drive_mode[o] != ShapeMode::Off {
                                let shaped = self.shapers[o].process(osc_sum, o_drive_mode[o], o_drive[o]);
                                let delta = shaped - osc_sum;
                                let gc = &osc_uni_gains[o][uni_count / 2];
                                for c in 0..nch {
                                    ch_acc[c] += delta * gc[c];
                                }
                            }
                        }
                    }

                    if ring_amt > 0.0005 {
                        for u in 0..uni_count {
                            let rm = raw0_stack[u] * raw1_stack[u] * ring_amt * 1.25 * uni_level[u];
                            let g = &uni_gains[u];
                            for c in 0..nch {
                                ch_acc[c] += rm * g[c];
                            }
                        }
                    }

                    if o_on[2] && o_lvl[2] > 0.0001 {
                        let table = &tables[o_table[2]];
                        let mut osc_sum = 0.0f32;
                        for u in 0..uni_count {
                            let det = unison_detune_curve(u, uni_count) * uni_detune * 0.14;
                            let inc = o_inc[2] * (1.0 + det);
                            let raw = if o_wavetable[2] {
                                self.phasors[2][u].wavetable(table, o_morph[2], inc)
                            } else {
                                self.phasors[2][u].analog(o_shape[2], inc, o_pw[2])
                            };
                            let v = raw * o_lvl[2] * uni_level[u];
                            let g = &osc_uni_gains[2][u];
                            for c in 0..nch {
                                ch_acc[c] += v * g[c];
                            }
                            osc_sum += v;
                        }
                        if o_drive_mode[2] != ShapeMode::Off {
                            let shaped = self.shapers[2].process(osc_sum, o_drive_mode[2], o_drive[2]);
                            let delta = shaped - osc_sum;
                            let gc = &osc_uni_gains[2][uni_count / 2];
                            for c in 0..nch {
                                ch_acc[c] += delta * gc[c];
                            }
                        }
                    }
                } else {
                    for o in 0..NUM_OSC {
                        if !o_on[o] || o_lvl[o] <= 0.0001 {
                            continue;
                        }
                        let table = &tables[o_table[o]];
                        let mut osc_sum = 0.0f32;
                        for u in 0..uni_count {
                            let det = unison_detune_curve(u, uni_count) * uni_detune * 0.14;
                            let inc = o_inc[o] * (1.0 + det);
                            let raw = if o_wavetable[o] {
                                self.phasors[o][u].wavetable(table, o_morph[o], inc)
                            } else {
                                self.phasors[o][u].analog(o_shape[o], inc, o_pw[o])
                            };
                            let v = raw * o_lvl[o] * uni_level[u];
                            let g = &osc_uni_gains[o][u];
                            for c in 0..nch {
                                ch_acc[c] += v * g[c];
                            }
                            osc_sum += v;
                        }
                        if o_drive_mode[o] != ShapeMode::Off {
                            let shaped = self.shapers[o].process(osc_sum, o_drive_mode[o], o_drive[o]);
                            let delta = shaped - osc_sum;
                            let gc = &osc_uni_gains[o][uni_count / 2];
                            for c in 0..nch {
                                ch_acc[c] += delta * gc[c];
                            }
                        }
                    }
                }

                if sub_lvl > 0.0001 {
                    let v = self.sub.analog(sub_shape, sub_inc, 0.5) * sub_lvl;
                    let g = &uni_gains[uni_count / 2];
                    for c in 0..nch {
                        ch_acc[c] += v * g[c];
                    }
                }
                if noise_lvl > 0.0001 {
                    let v = if noise_pink { self.noise.pink(&mut self.rng) } else { self.noise.white(&mut self.rng) } * noise_lvl;
                    let g = &uni_gains[uni_count / 2];
                    for c in 0..nch {
                        ch_acc[c] += v * g[c];
                    }
                }
                if str_lvl > 0.0001 {
                    let v = self.string.process(str_hz, str_damp, str_tone, str_bow, str_body, str_pick, sr) * str_lvl;
                    let g = &uni_gains[uni_count / 2];
                    for c in 0..nch {
                        ch_acc[c] += v * g[c];
                    }
                }

                let cut0_eff = if xmod_flt > 0.0005 {
                    (cut[0] * (2.0f32).powf(osc2_filter_mod * xmod_flt * 2.5)).clamp(20.0, 20000.0)
                } else {
                    cut[0]
                };

                for c in 0..nch {
                    let mut x = ch_acc[c];
                    if warmth_amt > 0.0005 {
                        let d = 1.0 + warmth_amt * 2.2;
                        let bias = 0.14 * warmth_amt;
                        x = (crate::filter::tanh_fast((x + bias) * d) - crate::filter::tanh_fast(bias * d))
                            * (1.0 / (1.0 + warmth_amt * 0.55));
                    }
                    let mut y = x;
                    if f_on[0] {
                        let wet0 = if is_ladder[0] {
                            self.ladders[0][c].process(x, cut0_eff, res[0], drv[0], sr)
                        } else {
                            self.svfs[0][c].process(x, cut0_eff, res[0], sr, svf_mode[0])
                        };
                        y = x + (wet0 - x) * f_mix[0];
                    }
                    if f_on[1] {
                        let input2 = if parallel { x } else { y };
                        let wet1 = if is_ladder[1] {
                            self.ladders[1][c].process(input2, cut[1], res[1], drv[1], sr)
                        } else {
                            self.svfs[1][c].process(input2, cut[1], res[1], sr, svf_mode[1])
                        };
                        let y2 = input2 + (wet1 - input2) * f_mix[1];
                        y = if parallel { (y + y2) * 0.7071 } else { y2 };
                    }
                    out[c][idx] += y * self.amp_smooth;
                }
            }

            frame += n;
            self.age += n as u64;
        }

        if self.is_finished() {
            self.active = false;
        }
    }
}

// ── VELA parameter resolution ────────────────────────────────────────────────

#[inline]
pub(crate) fn modal_spec_for(note: f32, p: &Params) -> ModalSpec {
    ModalSpec {
        f0: midi_to_hz(note),
        count: partial_count(p.get(MODAL_BASE + M_PARTIALS)),
        inharm: p.get(MODAL_BASE + M_INHARM).clamp(0.0, 1.0),
        spread: p.get(MODAL_BASE + M_SPREAD).clamp(0.0, 1.0),
        decay: modal_decay_s(p.get(MODAL_BASE + M_DECAY)),
        decay_tilt: p.get(MODAL_BASE + M_DECAY_TILT) * 2.0 - 1.0,
        material: Material::from_index(p.get(MODAL_BASE + M_MATERIAL) as u32),
        anima: p.get(MODAL_BASE + M_ANIMA).clamp(0.0, 1.0),
        beat: p.get(MODAL_BASE + M_BEAT).clamp(0.0, 1.0),
        beat_rate: beat_rate_hz(p.get(MODAL_BASE + M_BEAT_RATE)),
        position: p.get(MODAL_BASE + M_POSITION).clamp(0.0, 1.0),
        keytrack: p.get(MODAL_BASE + M_KEYTRACK).clamp(0.0, 1.0),
        morph: p.get(MODAL_BASE + M_MORPH) * 2.0 - 1.0,
        morph_time: morph_time_s(p.get(MODAL_BASE + M_MORPH_TIME)),
        mode: BankMode::from_index(p.get(MODAL_BASE + M_MODE) as u32),
        formant: p.get(MODAL_BASE + M_FORMANT).clamp(0.0, 1.0),
        formant_shift: p.get(MODAL_BASE + M_FORMANT_SHIFT).clamp(0.0, 1.0),
        bloom: p.get(MODAL_BASE + M_BLOOM).clamp(0.0, 1.0),
        spotlight: p.get(MODAL_BASE + M_SPOTLIGHT).clamp(0.0, 1.0),
        spotlight_pos: p.get(MODAL_BASE + M_SPOTLIGHT_POS).clamp(0.0, 1.0),
        spotlight_width: p.get(MODAL_BASE + M_SPOTLIGHT_WIDTH).clamp(0.0, 1.0),
        vibrato: p.get(MODAL_BASE + M_VIBRATO).clamp(0.0, 1.0) * 1.2,
        vibrato_rate: vibrato_rate_hz(p.get(MODAL_BASE + M_VIBRATO_RATE)),
        subharm: p.get(MODAL_BASE + M_SUBHARM).clamp(0.0, 1.0),
    }
}

#[inline]
pub(crate) fn modal_spec_modulated(note: f32, p: &Params, matrix: &ModMatrix, mv: &ModValues) -> ModalSpec {
    let mw = mv.mod_wheel.clamp(0.0, 1.0);
    let expr_timbre = mv.timbre.clamp(0.0, 1.0);
    let expr_press = mv.pressure.clamp(0.0, 1.0);

    let inharm = (p.get(MODAL_BASE + M_INHARM) + matrix.amount_for(MODAL_BASE + M_INHARM, mv)).clamp(0.0, 1.0);
    let spread = (p.get(MODAL_BASE + M_SPREAD) + matrix.amount_for(MODAL_BASE + M_SPREAD, mv)).clamp(0.0, 1.0);
    let decay_norm = (p.get(MODAL_BASE + M_DECAY) + matrix.amount_for(MODAL_BASE + M_DECAY, mv)).clamp(0.0, 1.0);
    let tilt_norm = (p.get(MODAL_BASE + M_DECAY_TILT) + matrix.amount_for(MODAL_BASE + M_DECAY_TILT, mv)).clamp(0.0, 1.0);
    let anima = (p.get(MODAL_BASE + M_ANIMA) + matrix.amount_for(MODAL_BASE + M_ANIMA, mv)).clamp(0.0, 1.0);
    let beat = (p.get(MODAL_BASE + M_BEAT) + matrix.amount_for(MODAL_BASE + M_BEAT, mv)).clamp(0.0, 1.0);
    let beat_rate_norm = (p.get(MODAL_BASE + M_BEAT_RATE) + matrix.amount_for(MODAL_BASE + M_BEAT_RATE, mv)).clamp(0.0, 1.0);
    let position = (p.get(MODAL_BASE + M_POSITION)
        + matrix.amount_for(MODAL_BASE + M_POSITION, mv)
        + expr_timbre * 0.22)
        .clamp(0.0, 1.0);
    let morph_norm = (p.get(MODAL_BASE + M_MORPH) + matrix.amount_for(MODAL_BASE + M_MORPH, mv)).clamp(0.0, 1.0);
    let formant = (p.get(MODAL_BASE + M_FORMANT) + matrix.amount_for(MODAL_BASE + M_FORMANT, mv)).clamp(0.0, 1.0);
    let formant_shift = (p.get(MODAL_BASE + M_FORMANT_SHIFT)
        + matrix.amount_for(MODAL_BASE + M_FORMANT_SHIFT, mv)
        + expr_timbre * 0.18
        + mw * 0.10)
        .clamp(0.0, 1.0);
    let bloom = (p.get(MODAL_BASE + M_BLOOM) + matrix.amount_for(MODAL_BASE + M_BLOOM, mv)).clamp(0.0, 1.0);
    let spotlight = (p.get(MODAL_BASE + M_SPOTLIGHT)
        + matrix.amount_for(MODAL_BASE + M_SPOTLIGHT, mv)
        + expr_press * 0.15)
        .clamp(0.0, 1.0);
    let spotlight_pos = (p.get(MODAL_BASE + M_SPOTLIGHT_POS) + matrix.amount_for(MODAL_BASE + M_SPOTLIGHT_POS, mv)).clamp(0.0, 1.0);
    let spotlight_width = (p.get(MODAL_BASE + M_SPOTLIGHT_WIDTH) + matrix.amount_for(MODAL_BASE + M_SPOTLIGHT_WIDTH, mv)).clamp(0.0, 1.0);
    let vibrato_norm = (p.get(MODAL_BASE + M_VIBRATO)
        + matrix.amount_for(MODAL_BASE + M_VIBRATO, mv)
        + mw * 0.35)
        .clamp(0.0, 1.0);
    let vibrato_rate_norm = (p.get(MODAL_BASE + M_VIBRATO_RATE) + matrix.amount_for(MODAL_BASE + M_VIBRATO_RATE, mv)).clamp(0.0, 1.0);
    let subharm = (p.get(MODAL_BASE + M_SUBHARM) + matrix.amount_for(MODAL_BASE + M_SUBHARM, mv)).clamp(0.0, 1.0);

    ModalSpec {
        f0: midi_to_hz(note),
        count: partial_count(p.get(MODAL_BASE + M_PARTIALS)),
        inharm,
        spread,
        decay: modal_decay_s(decay_norm),
        decay_tilt: tilt_norm * 2.0 - 1.0,
        material: Material::from_index(p.get(MODAL_BASE + M_MATERIAL) as u32),
        anima,
        beat,
        beat_rate: beat_rate_hz(beat_rate_norm),
        position,
        keytrack: p.get(MODAL_BASE + M_KEYTRACK).clamp(0.0, 1.0),
        morph: morph_norm * 2.0 - 1.0,
        morph_time: morph_time_s(p.get(MODAL_BASE + M_MORPH_TIME)),
        mode: BankMode::from_index(p.get(MODAL_BASE + M_MODE) as u32),
        formant,
        formant_shift,
        bloom,
        spotlight,
        spotlight_pos,
        spotlight_width,
        vibrato: vibrato_norm * 1.2,
        vibrato_rate: vibrato_rate_hz(vibrato_rate_norm),
        subharm,
    }
}

#[inline]
pub(crate) fn exciter_spec(p: &Params, velocity: f32) -> ExciterSpec {
    ExciterSpec {
        kind: ExciterType::from_index(p.get(EXC_BASE + X_TYPE) as u32),
        pressure: p.get(EXC_BASE + X_PRESSURE).clamp(0.0, 1.0),
        grain: p.get(EXC_BASE + X_GRAIN).clamp(0.0, 1.0),
        tone: p.get(EXC_BASE + X_TONE).clamp(0.0, 1.0),
        vel_tilt: p.get(EXC_BASE + X_VEL_TILT).clamp(0.0, 1.0),
        pulse: p.get(EXC_BASE + X_PULSE).clamp(0.0, 1.0),
        pulse_rate: pulse_rate_hz(p.get(EXC_BASE + X_PULSE_RATE)),
        velocity: velocity.clamp(0.0, 1.0),
    }
}

#[inline]
pub(crate) fn exciter_spec_modulated(p: &Params, velocity: f32, matrix: &ModMatrix, mv: &ModValues) -> ExciterSpec {
    let pressure = (p.get(EXC_BASE + X_PRESSURE)
        + matrix.amount_for(EXC_BASE + X_PRESSURE, mv)
        + mv.pressure.clamp(0.0, 1.0) * 0.35)
        .clamp(0.0, 1.0);
    let grain = (p.get(EXC_BASE + X_GRAIN) + matrix.amount_for(EXC_BASE + X_GRAIN, mv)).clamp(0.0, 1.0);
    let tone = (p.get(EXC_BASE + X_TONE)
        + matrix.amount_for(EXC_BASE + X_TONE, mv)
        + mv.timbre.clamp(0.0, 1.0) * 0.20)
        .clamp(0.0, 1.0);
    let pulse = (p.get(EXC_BASE + X_PULSE) + matrix.amount_for(EXC_BASE + X_PULSE, mv)).clamp(0.0, 1.0);
    let pulse_rate_norm = (p.get(EXC_BASE + X_PULSE_RATE) + matrix.amount_for(EXC_BASE + X_PULSE_RATE, mv)).clamp(0.0, 1.0);

    ExciterSpec {
        kind: ExciterType::from_index(p.get(EXC_BASE + X_TYPE) as u32),
        pressure,
        grain,
        tone,
        vel_tilt: p.get(EXC_BASE + X_VEL_TILT).clamp(0.0, 1.0),
        pulse,
        pulse_rate: pulse_rate_hz(pulse_rate_norm),
        velocity: velocity.clamp(0.0, 1.0),
    }
}
