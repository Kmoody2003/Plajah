//! One synth voice: oscillators → filters → amp → spatial pan.
//!
//! Modulation runs at control rate (every `CONTROL_BLOCK` samples) rather than per sample. At
//! 48k that is a ~3 kHz control rate — inaudibly smooth for envelopes and LFOs, and ~16× cheaper
//! than evaluating the whole mod matrix per sample. Cutoff and amp are additionally one-pole
//! smoothed so a control step never produces a zipper.

use crate::env::Envelope;
use crate::filter::{Ladder, Svf, SvfMode};
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

    pub fn note_on(&mut self, note: f32, vel: f32, id: u32, p: &Params, glide_from: Option<f32>, delay: u32) {
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
    }

    pub fn note_off(&mut self) {
        self.released = true;
        for e in self.envs.iter_mut() {
            e.note_off();
        }
    }

    pub fn kill(&mut self) {
        self.active = false;
        for e in self.envs.iter_mut() {
            e.hard_reset();
        }
    }

    #[inline]
    pub fn is_finished(&self) -> bool {
        !self.envs[0].is_active()
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
