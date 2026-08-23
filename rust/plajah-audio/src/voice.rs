//! One synth voice: oscillators → filters → amp → spatial pan.
//!
//! Modulation runs at control rate (every `CONTROL_BLOCK` samples) rather than per sample. At
//! 48k that is a ~3 kHz control rate — inaudibly smooth for envelopes and LFOs, and ~16× cheaper
//! than evaluating the whole mod matrix per sample. Cutoff and amp are additionally one-pole
//! smoothed so a control step never produces a zipper.

use crate::env::Envelope;
use crate::exciter::{Exciter, ExciterSpec, ExciterType};
use crate::filter::{Ladder, Svf, SvfMode};
use crate::modal::{partial_count, BankMode, Material, ModalBank, ModalSpec};
use crate::modmatrix::{ModMatrix, ModValues};
use crate::osc::{unison_detune_curve, AnalogShape, Noise, Phasor, Rng};
use crate::params::*;
use crate::sample::{SampleBank, SampleVoice};
use crate::shaper::{ShapeMode, Shaper};
use crate::spatial::{pan_gains, Layout, Position, MAX_CHANNELS};
use crate::tables::WaveTable;

pub const CONTROL_BLOCK: usize = 16;
pub const MAX_UNISON: usize = 16;
const NUM_OSC: usize = 3;

#[inline]
fn midi_to_hz(note: f32) -> f32 {
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
}

impl Voice {
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng(seed | 1);
        let mut drift = [0.0f32; NUM_OSC];
        for d in drift.iter_mut() {
            *d = rng.bipolar();
        }
        Self {
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

    /// Assign a sample to this voice — call right after `note_on` for a KERA voice. `start_frame`
    /// lets the host honour a zone's play-start offset; `detune_cents` folds in the zone tuning.
    pub fn set_sample(&mut self, slot: i32, start_frame: f64, detune_cents: f32) {
        self.sample.start(slot, start_frame);
        self.sample_detune = detune_cents;
    }

    pub fn note_on(&mut self, note: f32, vel: f32, id: u32, p: &Params, glide_from: Option<f32>, delay: u32, sr_hint: f32) {
        self.active = true;
        self.released = false;
        self.note = note;
        self.velocity = vel.clamp(0.0, 1.0);
        self.voice_id = id;
        self.start_delay = delay;
        self.expr = Expression::default();
        self.glide_note = glide_from.unwrap_or(note);
        self.sample.clear(); // synth mode by default; a KERA note-on calls set_sample after

        let free_phase = p.get(osc_param(0, O_PHASE)) >= 0.999;
        for o in 0..NUM_OSC {
            let start = p.get(osc_param(o, O_PHASE));
            for u in 0..MAX_UNISON {
                let ph = if free_phase { self.rng.next_f32() } else {
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

        for e in 0..NUM_ENV {
            self.envs[e].set_adsr(
                env_time(p.get(env_param(e, E_ATTACK))),
                env_time(p.get(env_param(e, E_DECAY))),
                p.get(env_param(e, E_SUSTAIN)),
                env_time(p.get(env_param(e, E_RELEASE))),
            );
            self.envs[e].note_on();
        }
        self.amp_smooth = 0.0;

        // VELA: lay out the partials for this pitch, then arm the exciter. The layout is
        // computed once per note rather than per block — 64 partials across 32 voices every
        // 2.7 ms is not affordable, and the body does not change while a note rings.
        self.modal_active = p.get(MODAL_BASE + M_ENABLE) > 0.5;
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
    }

    #[inline]
    pub fn is_finished(&self) -> bool {
        if self.modal_active {
            // A modal voice outlives its amp envelope by design: energy is still leaving the
            // bank long after the exciter stopped. Freeing it on the envelope would chop a
            // forty-second tail, which is far more audible than holding a voice slightly long.
            // A voice still swelling in has not sounded yet; freeing it on a quiet bank would
            // silently drop every slow-attack note.
            if self.swell < 1.0 {
                return false;
            }
            // A driven voice ends when its gate has faded, not when the bank goes quiet — the
            // bank never does. This must NOT apply to a struck voice: gate_amp starts at zero
            // and only rises while rendering, so a note-off arriving before the first block
            // would report the voice finished and kill it before it ever sounded.
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

    /// The VELA render path. Separate from the subtractive path on purpose: a modal voice has
    /// no oscillators, no filters and no amp envelope on its output — the bank's own decay IS
    /// the envelope, and running the note through a VCA afterwards would flatten exactly the
    /// behaviour the instrument exists to produce.
    #[allow(clippy::too_many_arguments)]
    fn render_modal(
        &mut self,
        out: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        p: &Params,
        sr: f32,
        layout: Layout,
        base_pos: Position,
    ) {
        let nch = layout.channels();
        let mut gains = [0.0f32; MAX_CHANNELS];
        pan_gains(base_pos, layout, 0.0, &mut gains);

        let xs = exciter_spec(p, self.velocity);
        let sustained = p.get(MODAL_BASE + M_MODE) as u32 != 0;
        // A sustained bank is driven rather than excited, so its gate is the note itself.
        let gate = !self.released && (sustained || xs.kind.is_continuous());
        // Release length scales with the Veil so a big patch does not snap shut. 0.4-3 s.
        let rel_k = 1.0 / ((0.4 + p.get(VEIL_BASE + V_DECAY) * 2.6) * sr);
        // Continuous excitation is scaled by the bank's bandwidth; a strike is not. See
        // ModalBank::sustain_scale for why the two cannot share a normalisation.
        let drive = if xs.kind.is_continuous() { self.modal.sustain_scale() } else { 1.0 };
        // Velocity trims level only slightly; most of it went into the exciter's spectral tilt,
        // which is how a real body responds to being hit harder.
        let level = (0.35 + 0.65 * self.velocity) * p.get(P_MASTER_GAIN).max(0.0);

        for f in 0..frames {
            if self.start_delay > 0 {
                self.start_delay -= 1;
                continue;
            }
            if self.swell < 1.0 {
                self.swell = (self.swell + self.swell_inc).min(1.0);
            }
            let target = if self.released { 0.0 } else { 1.0 };
            self.gate_amp += (target - self.gate_amp) * rel_k * 4.0;
            // Equal-power-ish curve: a linear swell sounds like it hesitates then rushes.
            let swell = self.swell * self.swell * (3.0 - 2.0 * self.swell);
            let x = self.exciter.process(&xs, gate, sr) * drive;
            let driven = if sustained { self.gate_amp } else { 1.0 };
            let y = self.modal.process(x) * level * swell * driven;
            if !y.is_finite() {
                continue;
            }
            for c in 0..nch {
                out[c][f] += y * gains[c];
            }
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
        tables: &[WaveTable],
        bank: &SampleBank,
        sr: f32,
        layout: Layout,
        base_pos: Position,
    ) {
        if !self.active {
            return;
        }
        if self.modal_active {
            self.render_modal(out, frames, p, sr, layout, base_pos);
            return;
        }
        let dt = 1.0 / sr;
        let inv_ctl = 1.0 / CONTROL_BLOCK as f32;
        let glide_time = p.get(P_GLIDE) * 2.0;
        let bend_range = p.get(P_BEND_RANGE) * 24.0;
        let drift_amt = p.get(P_ANALOG_DRIFT);

        let uni_count = (1.0 + p.get(P_UNISON_COUNT) * 15.0).round().clamp(1.0, MAX_UNISON as f32) as usize;
        let uni_detune = p.get(P_UNISON_DETUNE);
        let uni_width = p.get(P_UNISON_WIDTH);
        let uni_blend = p.get(P_UNISON_BLEND);

        let mut frame = 0usize;
        while frame < frames {
            let n = CONTROL_BLOCK.min(frames - frame);

            // ── control rate: envelopes, mod values, resolved parameters ──────────
            let mut mv = *globals;
            for e in 0..NUM_ENV {
                mv.env[e] = self.envs[e].tick(dt * CONTROL_BLOCK as f32);
            }
            mv.velocity = self.velocity;
            mv.key_track = (self.note - 60.0) / 48.0;
            mv.pressure = self.expr.pressure;
            mv.timbre = self.expr.timbre;
            mv.pitch_bend = self.expr.pitch_bend;
            mv.random = self.drift[0];

            // Glide toward the target note.
            if glide_time > 0.0005 {
                let k = 1.0 - (-(dt * CONTROL_BLOCK as f32) / glide_time).exp();
                self.glide_note += (self.note - self.glide_note) * k;
            } else {
                self.glide_note = self.note;
            }
            let bent = self.glide_note + self.expr.pitch_bend * bend_range;

            // Filters
            let mut cut = [0.0f32; 2];
            let mut res = [0.0f32; 2];
            let mut drv = [0.0f32; 2];
            let mut is_ladder = [true; 2];
            let mut svf_mode = [SvfMode::Low; 2];
            let mut f_on = [false; 2];
            for f in 0..2 {
                f_on[f] = p.get(flt_param(f, F_ENABLE)) > 0.5;
                let base = p.get(flt_param(f, F_CUTOFF));
                let m = matrix.amount_for(flt_param(f, F_CUTOFF), &mv);
                let kt = p.get(flt_param(f, F_KEYTRACK)) * (self.note - 60.0) / 60.0;
                let envamt = (p.get(flt_param(f, F_ENV_AMT)) - 0.5) * 2.0 * mv.env[1];
                let target = cutoff_hz((base + m + kt + envamt).clamp(0.0, 1.0));
                // One-pole smoothing: a stepped cutoff is the classic digital-synth zipper.
                self.cutoff_smooth[f] += (target - self.cutoff_smooth[f]) * 0.35;
                cut[f] = self.cutoff_smooth[f];
                res[f] = (p.get(flt_param(f, F_RES)) + matrix.amount_for(flt_param(f, F_RES), &mv)).clamp(0.0, 1.0);
                drv[f] = p.get(flt_param(f, F_DRIVE));
                is_ladder[f] = p.get(flt_param(f, F_TYPE)) < 0.5;
                svf_mode[f] = SvfMode::from_index(p.get(flt_param(f, F_MODE)) as u32);
            }
            let parallel = p.get(P_FILTER_ROUTING) > 0.5;

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
            for o in 0..NUM_OSC {
                o_on[o] = p.get(osc_param(o, O_ENABLE)) > 0.5;
                if !o_on[o] {
                    continue;
                }
                o_lvl[o] = (p.get(osc_param(o, O_LEVEL)) + matrix.amount_for(osc_param(o, O_LEVEL), &mv)).clamp(0.0, 1.5);
                let coarse = (p.get(osc_param(o, O_COARSE)) - 0.5) * 48.0;
                let fine = (p.get(osc_param(o, O_FINE)) - 0.5) * 2.0; // ±1 semitone
                let drift = self.drift[o] * drift_amt * 0.06;
                let semis = bent + coarse + fine + drift
                    + matrix.amount_for(osc_param(o, O_COARSE), &mv) * 24.0;
                o_inc[o] = midi_to_hz(semis) / sr;
                o_morph[o] = (p.get(osc_param(o, O_MORPH)) + matrix.amount_for(osc_param(o, O_MORPH), &mv)).clamp(0.0, 1.0);
                o_wavetable[o] = p.get(osc_param(o, O_MODE)) < 0.5;
                o_shape[o] = AnalogShape::from_index(p.get(osc_param(o, O_ANALOG_SHAPE)) as u32);
                o_pw[o] = (p.get(osc_param(o, O_PULSE_WIDTH)) + matrix.amount_for(osc_param(o, O_PULSE_WIDTH), &mv)).clamp(0.02, 0.98);
                o_table[o] = (p.get(osc_param(o, O_TABLE)) as usize).min(tables.len().saturating_sub(1));
                o_drive[o] = p.get(osc_param(o, O_DRIVE));
                o_drive_mode[o] = ShapeMode::from_index(p.get(osc_param(o, O_DRIVE_MODE)) as u32);
            }

            let sub_lvl = p.get(P_SUB_LEVEL);
            let sub_oct = if p.get(P_SUB_OCTAVE) > 0.5 { 2.0 } else { 1.0 };
            let sub_inc = midi_to_hz(bent - 12.0 * sub_oct) / sr;
            let sub_shape = AnalogShape::from_index(p.get(P_SUB_SHAPE) as u32);
            let noise_lvl = p.get(P_NOISE_LEVEL);
            let noise_pink = p.get(P_NOISE_COLOR) > 0.5;

            let amp_target = mv.env[0]
                * (0.25 + 0.75 * self.velocity)
                * (p.get(P_MASTER_GAIN) + matrix.amount_for(P_MASTER_GAIN, &mv)).clamp(0.0, 1.5);

            // Spatial: unison spreads in AZIMUTH around the source position, so a wide patch is
            // genuinely wide in any layout rather than only in stereo.
            let spread_mod = matrix.amount_for(P_UNISON_WIDTH, &mv);
            let width = (uni_width + spread_mod).clamp(0.0, 1.0);
            let mut uni_gains = [[0.0f32; MAX_CHANNELS]; MAX_UNISON];
            let base_az = base_pos.azimuth();
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

                // Per-unison-voice accumulation into channel gains.
                let mut ch_acc = [0.0f32; MAX_CHANNELS];
                let mut mono_pre = 0.0f32;

                // ── sample source (KERA): replaces the oscillators, keeps everything downstream ──
                // Gate on "is a sample voice" (slot >= 0), NOT is_active(): once the sample ends or
                // fails to load, is_active() goes false — and the old code then fell through to the
                // oscillators, so a KERA note played a synth tone. A sample voice stays silent (and
                // frees via the envelope) instead of ever running the synth.
                if self.sample.slot >= 0 {
                    // Ratio: pitch distance from the sample's root, plus the sample-rate mismatch,
                    // plus the zone detune. Read once, panned by the (centre) source position.
                    let root = bank.get(self.sample.slot as usize).map(|s| s.root_note).unwrap_or(60.0);
                    let native = bank.get(self.sample.slot as usize).map(|s| s.sample_rate).unwrap_or(sr);
                    let semis = bent - root + self.sample_detune / 100.0;
                    let rate = (2.0f32).powf(semis / 12.0) as f64 * (native as f64 / sr as f64);
                    let (sl, sr_ch) = self.sample.next(bank, rate, self.released);
                    let g = &uni_gains[uni_count / 2];
                    // Stereo samples keep their own image; mono spreads to the source position.
                    if bank.get(self.sample.slot as usize).map(|s| s.channels.len() > 1).unwrap_or(false) {
                        // L/R fold into the first two channels, then the source-position pan tints.
                        for c in 0..nch {
                            let s_ch = if c == 0 { sl } else if c == 1 { sr_ch } else { (sl + sr_ch) * 0.5 };
                            ch_acc[c] += s_ch * g[c].max(0.5);
                        }
                    } else {
                        for c in 0..nch {
                            ch_acc[c] += sl * g[c];
                        }
                    }
                    // Sample ran out (one-shot end, or a post-release tail past the loop): release
                    // the envelopes ONCE so the voice frees. Guard on `released` — the branch now
                    // runs every block for a sample voice, and re-calling note_off each block would
                    // keep restarting the release so the voice never frees.
                    if !self.sample.is_active() && !self.released {
                        self.released = true;
                        for e in self.envs.iter_mut() { e.note_off(); }
                    }
                    // Skip the synth sources entirely for a sample voice.
                    let mut y_acc = ch_acc;
                    for c in 0..nch {
                        let x = ch_acc[c];
                        let mut y = x;
                        if f_on[0] {
                            y = if is_ladder[0] { self.ladders[0][c].process(x, cut[0], res[0], drv[0], sr) }
                                else { self.svfs[0][c].process(x, cut[0], res[0], sr, svf_mode[0]) };
                        }
                        if f_on[1] {
                            let input2 = if parallel { x } else { y };
                            let y2 = if is_ladder[1] { self.ladders[1][c].process(input2, cut[1], res[1], drv[1], sr) }
                                else { self.svfs[1][c].process(input2, cut[1], res[1], sr, svf_mode[1]) };
                            y = if parallel { (y + y2) * 0.7071 } else { y2 };
                        }
                        y_acc[c] = y;
                        out[c][idx] += y * self.amp_smooth;
                    }
                    let _ = y_acc;
                    continue;
                }

                for o in 0..NUM_OSC {
                    if !o_on[o] || o_lvl[o] <= 0.0001 {
                        continue;
                    }
                    let table = &tables[o_table[o]];
                    for u in 0..uni_count {
                        let det = unison_detune_curve(u, uni_count) * uni_detune * 0.14;
                        let inc = o_inc[o] * (1.0 + det);
                        let raw = if o_wavetable[o] {
                            self.phasors[o][u].wavetable(table, o_morph[o], inc)
                        } else {
                            self.phasors[o][u].analog(o_shape[o], inc, o_pw[o])
                        };
                        let v = raw * o_lvl[o] * uni_level[u];
                        let g = &uni_gains[u];
                        for c in 0..nch {
                            ch_acc[c] += v * g[c];
                        }
                        mono_pre += v;
                    }
                    // Per-oscillator drive on the summed unison stack (cheaper and thicker than
                    // shaping each unison voice separately).
                    if o_drive_mode[o] != ShapeMode::Off {
                        let shaped = self.shapers[o].process(mono_pre, o_drive_mode[o], o_drive[o]);
                        let delta = shaped - mono_pre;
                        let gc = &uni_gains[uni_count / 2];
                        for c in 0..nch {
                            ch_acc[c] += delta * gc[c];
                        }
                        mono_pre = shaped;
                    }
                }

                if sub_lvl > 0.0001 {
                    let v = self.sub.analog(sub_shape, sub_inc, 0.5) * sub_lvl;
                    // Sub stays centred: low frequencies carry no useful localisation and a
                    // panned sub is the classic way to wreck a mix in any format.
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

                // Filters run per channel, each with its own state, so resonance images correctly
                // instead of collapsing to the centre.
                for c in 0..nch {
                    let x = ch_acc[c];
                    let mut y = x;
                    if f_on[0] {
                        y = if is_ladder[0] {
                            self.ladders[0][c].process(x, cut[0], res[0], drv[0], sr)
                        } else {
                            self.svfs[0][c].process(x, cut[0], res[0], sr, svf_mode[0])
                        };
                    }
                    if f_on[1] {
                        let input2 = if parallel { x } else { y };
                        let y2 = if is_ladder[1] {
                            self.ladders[1][c].process(input2, cut[1], res[1], drv[1], sr)
                        } else {
                            self.svfs[1][c].process(input2, cut[1], res[1], sr, svf_mode[1])
                        };
                        y = if parallel { (y + y2) * 0.7071 } else { y2 };
                    }
                    out[c][idx] += y * self.amp_smooth;
                }
            }

            frame += n;
            self.age += n as u64;
            let _ = inv_ctl;
        }

        if self.is_finished() {
            self.active = false;
        }
    }
}

// ── VELA parameter resolution ────────────────────────────────────────────────
// Kept as free functions rather than methods so `note_on` and `render_modal` read the same
// parameters through the same code, and a mapping can never drift between them.

#[inline]
pub(crate) fn modal_spec_for(note: f32, p: &Params) -> ModalSpec {
    ModalSpec {
        f0: midi_to_hz(note),
        count: partial_count(p.get(MODAL_BASE + M_PARTIALS)),
        inharm: p.get(MODAL_BASE + M_INHARM).clamp(0.0, 1.0),
        spread: p.get(MODAL_BASE + M_SPREAD).clamp(0.0, 1.0),
        decay: modal_decay_s(p.get(MODAL_BASE + M_DECAY)),
        // Stored 0..1, used -1..+1, so the centre of the knob means "whatever the material does".
        decay_tilt: p.get(MODAL_BASE + M_DECAY_TILT) * 2.0 - 1.0,
        material: Material::from_index(p.get(MODAL_BASE + M_MATERIAL) as u32),
        anima: p.get(MODAL_BASE + M_ANIMA).clamp(0.0, 1.0),
        beat: p.get(MODAL_BASE + M_BEAT).clamp(0.0, 1.0),
        beat_rate: beat_rate_hz(p.get(MODAL_BASE + M_BEAT_RATE)),
        position: p.get(MODAL_BASE + M_POSITION).clamp(0.0, 1.0),
        keytrack: p.get(MODAL_BASE + M_KEYTRACK).clamp(0.0, 1.0),
        // Stored 0..1, used -1..+1 so the centre of the control means "do not evolve".
        morph: p.get(MODAL_BASE + M_MORPH) * 2.0 - 1.0,
        morph_time: morph_time_s(p.get(MODAL_BASE + M_MORPH_TIME)),
        mode: BankMode::from_index(p.get(MODAL_BASE + M_MODE) as u32),
        formant: p.get(MODAL_BASE + M_FORMANT).clamp(0.0, 1.0),
        formant_shift: p.get(MODAL_BASE + M_FORMANT_SHIFT).clamp(0.0, 1.0),
        bloom: p.get(MODAL_BASE + M_BLOOM).clamp(0.0, 1.0),
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
