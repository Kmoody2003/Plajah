//! The instrument engine: voice allocation, parameter store, global modulation, output stage.

use crate::diffuser::{Diffuser, VeilSpec};
use crate::bajo::BajoRack;
use crate::lfo::Lfo;
use crate::modmatrix::{ModMatrix, ModSource, ModValues, Route};
use crate::osc::Rng;
use crate::params::*;
use crate::sample::{LoopMode, SampleBank};
use crate::spatial::{IamfRole, Layout, Position, MAX_CHANNELS};
use crate::tables::WaveTable;
use crate::voice::{Voice, MAX_UNISON};

/// AudioWorklet always renders 128 frames, but leave headroom for offline/host block sizes.
pub const MAX_BLOCK: usize = 512;
pub const MAX_VOICES: usize = 32;
pub const MAX_TABLES: usize = 16;
/// Bounded so a runaway scheduler can never grow the heap mid-render.
pub const MAX_EVENTS: usize = 16384;

/// A note scheduled at an ABSOLUTE sample position.
///
/// This is what makes offline rendering possible. Live playback can post a note a few
/// milliseconds early and let the block-relative offset place it; an OfflineAudioContext renders
/// faster than messages arrive, so every note has to be queued *before* `startRendering()` and
/// then fired by the engine's own frame counter.
#[derive(Clone, Copy)]
struct ScheduledEvent {
    frame: u64,
    /// true = note on, false = note off.
    on: bool,
    note: f32,
    velocity: f32,
    voice_id: u32,
}

pub struct Engine {
    pub sr: f32,
    pub params: Params,
    pub matrix: ModMatrix,
    voices: Vec<Voice>,
    lfos: [Lfo; NUM_LFO],
    tables: Vec<WaveTable>,
    samples: SampleBank,
    rng: Rng,
    age_counter: u64,

    /// Scratch the voices sum into, then the ABI copies out. Channel-major so each channel is
    /// contiguous — that is the layout the worklet's `output[ch]` arrays want.
    scratch: Box<[[f32; MAX_BLOCK]; MAX_CHANNELS]>,

    /// Staging buffer the host writes raw wavetable data into before `commit_table`.
    upload: Vec<f32>,

    /// VELA's Veil. One instance after the voice sum — see diffuser.rs for why it is not
    /// per-voice. Allocated here at construction, never on the audio thread.
    veil: Diffuser,

    /// BAJO's rack: Throat → Scorch → Ghost Gate → Space, plus the wobble clock. Same argument
    /// as the Veil — it belongs to the patch, not the channel strip, so it renders offline
    /// identically. Bypassed entirely unless a BAJO section is switched on.
    bajo: BajoRack,

    events: Vec<ScheduledEvent>,
    events_dirty: bool,
    frame_counter: u64,

    pub layout: Layout,
    pub position: Position,
    pub iamf_role: IamfRole,
    pub beats_per_sec: f32,
    mod_wheel: f32,
    global_bend: f32,
    macros: [f32; 8],
}

impl Engine {
    pub fn new(sample_rate: f32) -> Self {
        let sr_real = if sample_rate > 1000.0 { sample_rate } else { 48000.0 };
        let mut voices = Vec::with_capacity(MAX_VOICES);
        for i in 0..MAX_VOICES {
            let seed = 0x9E3779B9u32.wrapping_mul(i as u32 + 1);
            let mut v = Voice::new(seed);
            // Size BAJO's string delay line for the real rate here, where allocating is legal.
            v.init_sr(sr_real, seed);
            voices.push(v);
        }
        let mut tables = Vec::with_capacity(MAX_TABLES);
        for _ in 0..MAX_TABLES {
            tables.push(WaveTable::empty());
        }
        Self {
            sr: if sample_rate > 1000.0 { sample_rate } else { 48000.0 },
            params: Params::new(),
            matrix: ModMatrix::default(),
            veil: Diffuser::new(if sample_rate > 1000.0 { sample_rate } else { 48000.0 }),
            bajo: BajoRack::new(if sample_rate > 1000.0 { sample_rate } else { 48000.0 }),
            voices,
            lfos: [Lfo::default(); NUM_LFO],
            tables,
            samples: SampleBank::new(),
            rng: Rng(0x1234_5678),
            age_counter: 0,
            scratch: Box::new([[0.0; MAX_BLOCK]; MAX_CHANNELS]),
            upload: vec![0.0; 64 * 2048],
            events: Vec::with_capacity(1024),
            events_dirty: false,
            frame_counter: 0,
            layout: Layout::Stereo,
            position: Position::default(),
            iamf_role: IamfRole::Object,
            beats_per_sec: 2.0,
            mod_wheel: 0.0,
            global_bend: 0.0,
            macros: [0.0; 8],
        }
    }

    pub fn upload_ptr(&mut self) -> *mut f32 {
        self.upload.as_mut_ptr()
    }
    pub fn upload_capacity(&self) -> usize {
        self.upload.len()
    }

    /// Build mip pyramids for a slot from whatever the host staged in `upload`.
    pub fn commit_table(&mut self, slot: usize, frames: usize, frame_size: usize) {
        if slot >= MAX_TABLES || frames == 0 || !frame_size.is_power_of_two() {
            return;
        }
        let need = frames * frame_size;
        if need > self.upload.len() {
            return;
        }
        self.tables[slot] = WaveTable::from_frames(&self.upload[..need], frames, frame_size);
    }

    /// Load a sample into a slot from the staged upload buffer (channel-major).
    #[allow(clippy::too_many_arguments)]
    pub fn load_sample(
        &mut self, slot: usize, frames: usize, channels: usize, sample_rate: f32,
        root_note: f32, loop_start: usize, loop_end: usize, loop_mode: u32,
    ) {
        let need = frames * channels;
        if need > self.upload.len() {
            return;
        }
        self.samples.load(
            slot, &self.upload[..need], frames, channels, sample_rate, root_note,
            loop_start, loop_end, LoopMode::from_index(loop_mode),
        );
    }

    /// Chunked sample load — the path the host actually uses, so a sample of any length loads
    /// (the staging buffer is small and shared with wavetables). `begin` allocates the slot,
    /// `chunk` fills it from the staging buffer in pieces, `end` makes it playable.
    #[allow(clippy::too_many_arguments)]
    pub fn sample_begin(
        &mut self, slot: usize, frames: usize, channels: usize, sample_rate: f32,
        root_note: f32, loop_start: usize, loop_end: usize, loop_mode: u32,
    ) {
        self.samples.begin(slot, frames, channels, sample_rate, root_note, loop_start, loop_end, LoopMode::from_index(loop_mode));
    }
    pub fn sample_chunk(&mut self, slot: usize, offset: usize, len: usize) {
        let n = len.min(self.upload.len());
        self.samples.chunk(slot, offset, &self.upload[..n]);
    }
    pub fn sample_end(&mut self, slot: usize) {
        self.samples.end(slot);
    }

    /// Play a note using a loaded sample slot — the KERA note-on. Same voice allocation as the
    /// synth, then the voice is switched to sample mode.
    pub fn note_on_sampled(&mut self, note: f32, vel: f32, voice_id: u32, frame_offset: u32, slot: i32, detune_cents: f32, start_frame: f64) {
        self.note_on(note, vel, voice_id, frame_offset);
        // note_on picked a voice; find the one it just started (matching voice_id, newest age).
        if let Some(v) = self.voices.iter_mut().filter(|v| v.active && v.voice_id == voice_id).max_by_key(|v| v.age) {
            v.set_sample(slot, start_frame, detune_cents);
        }
    }

    pub fn set_route(&mut self, index: usize, source: u32, dest: u32, depth: f32, via: u32) {
        if index >= crate::modmatrix::MAX_ROUTES {
            return;
        }
        let src = ModSource::from_u32(source);
        self.matrix.routes[index] = Route {
            source: src,
            dest,
            depth: depth.clamp(-1.0, 1.0),
            via: ModSource::from_u32(via),
            active: src != ModSource::None && depth.abs() > 0.0001,
        };
    }

    pub fn set_macro(&mut self, i: usize, v: f32) {
        if i < 8 {
            self.macros[i] = v.clamp(0.0, 1.0);
            self.params.set(MACRO_BASE + i as u32, self.macros[i]);
        }
    }

    pub fn set_mod_wheel(&mut self, v: f32) {
        self.mod_wheel = v.clamp(0.0, 1.0);
    }
    pub fn set_global_bend(&mut self, v: f32) {
        self.global_bend = v.clamp(-1.0, 1.0);
    }

    /// Per-note expression — the MPE path. Applies to the voice holding `voice_id`.
    pub fn set_expression(&mut self, voice_id: u32, bend: f32, pressure: f32, timbre: f32) {
        for v in self.voices.iter_mut() {
            if v.active && v.voice_id == voice_id {
                v.expr.pitch_bend = bend.clamp(-1.0, 1.0);
                v.expr.pressure = pressure.clamp(0.0, 1.0);
                v.expr.timbre = timbre.clamp(0.0, 1.0);
                return;
            }
        }
    }

    pub fn note_on(&mut self, note: f32, vel: f32, voice_id: u32, frame_offset: u32) {
        let mono = self.params.get(P_VOICE_MODE) > 0.5;
        let legato = self.params.get(P_VOICE_MODE) > 1.5;
        self.age_counter += 1;

        if mono {
            // Mono/legato: reuse the sounding voice so glide and (in legato) the envelope carry.
            if let Some(v) = self.voices.iter_mut().find(|v| v.active && !v.released) {
                let from = v.note;
                if legato {
                    v.note = note;
                    v.velocity = vel.clamp(0.0, 1.0);
                    v.voice_id = voice_id;
                    return;
                }
                let sr = self.sr;
                let p = &self.params;
                v.note_on(note, vel, voice_id, p, Some(from), frame_offset, sr);
                v.age = self.age_counter;
                return;
            }
        }

        let glide_from = if self.params.get(P_GLIDE) > 0.0005 {
            self.voices.iter().find(|v| v.active).map(|v| v.note)
        } else {
            None
        };

        // Free voice, else steal the oldest released one, else the oldest outright.
        let idx = self
            .voices
            .iter()
            .position(|v| !v.active)
            .or_else(|| {
                self.voices
                    .iter()
                    .enumerate()
                    .filter(|(_, v)| v.released)
                    .min_by_key(|(_, v)| v.age)
                    .map(|(i, _)| i)
            })
            .or_else(|| {
                self.voices
                    .iter()
                    .enumerate()
                    .min_by_key(|(_, v)| v.age)
                    .map(|(i, _)| i)
            })
            .unwrap_or(0);

        self.age_counter += 1;
        let age = self.age_counter;
        let sr = self.sr;
        let params = &self.params;
        let v = &mut self.voices[idx];
        v.note_on(note, vel, voice_id, params, glide_from, frame_offset, sr);
        v.age = age;

        for l in self.lfos.iter_mut() {
            l.retrigger_now(&mut self.rng);
        }
    }

    pub fn note_off(&mut self, voice_id: u32) {
        for v in self.voices.iter_mut() {
            if v.active && v.voice_id == voice_id && !v.released {
                v.note_off();
            }
        }
    }

    pub fn all_notes_off(&mut self, hard: bool) {
        for v in self.voices.iter_mut() {
            if hard {
                v.kill();
            } else if v.active {
                v.note_off();
            }
        }
        if hard {
            // A hard stop has to flush the Veil too. A sixty-second diffusion tail surviving a
            // panic-stop is exactly the bug that makes people stop trusting the stop button.
            self.veil.clear();
        }
    }

    pub fn active_voices(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    // ── Absolute-time scheduling (the offline-render path) ───────────────────

    pub fn schedule_note_on(&mut self, note: f32, velocity: f32, voice_id: u32, frame: f64) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: true, note, velocity, voice_id });
        self.events_dirty = true;
    }

    pub fn schedule_note_off(&mut self, voice_id: u32, frame: f64) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: false, note: 0.0, velocity: 0.0, voice_id });
        self.events_dirty = true;
    }

    pub fn clear_schedule(&mut self) {
        self.events.clear();
        self.events_dirty = false;
    }

    /// Rewind the engine's own clock. Called once before an offline render.
    pub fn reset_transport(&mut self, frame: f64) {
        self.frame_counter = frame.max(0.0) as u64;
    }

    /// Fire every queued event landing inside this block, converting absolute frames to the
    /// block-relative offset the voice allocator already understands.
    fn drain_events(&mut self, frames: usize) {
        if self.events.is_empty() {
            return;
        }
        if self.events_dirty {
            // Sort once per change, never per block — and note-ons before note-offs at the same
            // frame, so a zero-length note still articulates.
            self.events.sort_by(|a, b| a.frame.cmp(&b.frame).then(b.on.cmp(&a.on)));
            self.events_dirty = false;
        }
        let start = self.frame_counter;
        let end = start + frames as u64;
        let mut consumed = 0usize;
        for i in 0..self.events.len() {
            let ev = self.events[i];
            if ev.frame >= end {
                break;
            }
            // Anything already in the past fires immediately rather than being dropped.
            let offset = ev.frame.saturating_sub(start) as u32;
            if ev.on {
                self.note_on(ev.note, ev.velocity, ev.voice_id, offset);
            } else {
                self.note_off(ev.voice_id);
            }
            consumed = i + 1;
        }
        if consumed > 0 {
            self.events.drain(0..consumed);
        }
    }

    pub fn scratch_ptr(&mut self, ch: usize) -> *mut f32 {
        let c = ch.min(MAX_CHANNELS - 1);
        self.scratch[c].as_mut_ptr()
    }

    pub fn render(&mut self, frames: usize) {
        let frames = frames.min(MAX_BLOCK);
        self.drain_events(frames);
        let nch = self.layout.channels();
        for c in 0..nch {
            self.scratch[c][..frames].fill(0.0);
        }

        // Global (non-per-voice) modulation sources, refreshed once per block.
        let dt = frames as f32 / self.sr;
        let mut globals = ModValues::default();
        for (i, l) in self.lfos.iter_mut().enumerate() {
            l.shape = crate::lfo::LfoShape::from_index(self.params.get(lfo_param(i, L_SHAPE)) as u32);
            let rate_norm = self.params.get(lfo_param(i, L_RATE));
            l.rate_hz = if self.params.get(lfo_param(i, L_RANGE)) > 0.5 {
                lfo_rate_slow(rate_norm)
            } else {
                lfo_rate(rate_norm)
            };
            l.sync_beats = self.params.get(lfo_param(i, L_SYNC));
            l.bipolar = self.params.get(lfo_param(i, L_BIPOLAR)) > 0.5;
            l.retrigger = self.params.get(lfo_param(i, L_RETRIGGER)) > 0.5;
            l.fade = self.params.get(lfo_param(i, L_FADE)) * 4.0;
            globals.lfo[i] = l.tick(dt, self.beats_per_sec, &mut self.rng);
        }
        globals.mod_wheel = self.mod_wheel;
        globals.pitch_bend = self.global_bend;
        globals.macros = self.macros;

        // Transport position at the first sample of this block, in beats. The wobble rate lane
        // and the Ghost Gate both read it, which is what makes them land on the grid instead of
        // drifting against it.
        let beats = (self.frame_counter as f64 / self.sr as f64) * self.beats_per_sec as f64;
        let bps = self.beats_per_sec;

        // Resolve the wobble BEFORE the voices render, so every voice follows the same phase.
        let wf = self.bajo.wobble_frame(&self.params, beats, frames, bps);

        // Split the borrow: voices render into scratch while reading shared state immutably.
        // `veil` and `bajo` come out in the same destructure because both also need `scratch`
        // and a second `let Engine { .. } = self` would be a double mutable borrow.
        let Engine { voices, scratch, params, matrix, tables, samples, sr, layout, position, veil, bajo, .. } = self;
        for v in voices.iter_mut() {
            if v.active {
                v.render(scratch, frames, params, matrix, &globals, tables, samples, *sr, *layout, *position, &wf);
            }
        }

        // BAJO's rack, before the Veil — the Ghost Gate's spill has to exist before the reverb
        // that receives it runs.
        let bajo_on = BajoRack::active(params);
        if bajo_on {
            bajo.process(scratch, frames, nch, params, &wf, beats, bps);
        }

        // The Veil runs here: after every voice has summed, before the output stage. Being
        // inside the engine rather than on the track is what makes it travel with the patch and
        // render identically offline.
        let veil_mix = params.get(VEIL_BASE + V_MIX);
        let veil_freeze = params.get(VEIL_BASE + V_FREEZE) > 0.5;
        if veil_mix > 0.0001 || veil_freeze {
            let spec = VeilSpec {
                size: params.get(VEIL_BASE + V_SIZE),
                decay: params.get(VEIL_BASE + V_DECAY),
                diffusion: params.get(VEIL_BASE + V_DIFFUSION),
                shimmer: params.get(VEIL_BASE + V_SHIMMER),
                shimmer_ivl: params.get(VEIL_BASE + V_SHIMMER_IVL) as u32,
                blur: params.get(VEIL_BASE + V_BLUR),
                freeze: veil_freeze,
                mix: veil_mix,
            };
            let send = if bajo_on { bajo.spill_buffer() } else { None };
            veil.process(scratch, frames, nch, &spec, send);
        }

        // Soft clip on the way out: a synth stacking 32 voices × 16 unison will hit the rails,
        // and a gentle saturation is far kinder than a hard digital clip.
        for c in 0..nch {
            for s in 0..frames {
                let x = scratch[c][s];
                scratch[c][s] = crate::filter::tanh_fast(x * 0.85);
            }
        }
        self.frame_counter += frames as u64;
        let _ = MAX_UNISON;
    }
}
