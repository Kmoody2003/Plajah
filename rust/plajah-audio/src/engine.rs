//! The instrument engine: voice allocation, parameter store, global modulation, output stage.

use crate::aura::AuraRack;
use crate::diffuser::{Diffuser, VeilSpec};
use crate::bajo::BajoRack;
use crate::lyra::LyraRack;
use crate::tonos::TonosRack;
use crate::orch::OrchRack;
use crate::volta::{VoltaRack, VOLTA_PROBE_COUNT};
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
    /// KERA: the sample slot to play (-1 = a synth note), its zone detune and play-start frame.
    slot: i32,
    detune_cents: f32,
    start_frame: f64,
    /// SOMA deep skin (`note_on_deep`): layer level and the cloud's new floor; 0 top = not deep.
    deep_gain: f32,
    deep_top: f32,
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

    /// AURA's vintage analogue rack: 6-stage analog phaser → 3-phase BBD string ensemble →
    /// 15 IPS magnetic tape saturation & head bump → 60Hz mains hum & oxide crackle.
    aura: AuraRack,

    /// LYRA's amp stages: electric guitar amp + cab, tine piano preamp + stereo tremolo.
    lyra: LyraRack,
    /// TONOS sympathetic strings (sitar tarafs, sarangi, nyckelharpa…).
    tonos: TonosRack,
    /// ARCO's deep bodies (and the rest of the orchestra & guitar family's racks).
    orch: OrchRack,
    /// VOLTA's dual-mode vintage BBD / modern stereo chorus & circuit telemetry rack.
    volta: VoltaRack,

    events: Vec<ScheduledEvent>,
    events_dirty: bool,
    /// `soma_excitation` output.
    excite: Vec<f32>,
    frame_counter: u64,
    /// Frames of continuous silence with no voice sounding (see `render`'s idle skip).
    idle_frames: u64,

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
            sr: sr_real,
            params: Params::new(),
            matrix: ModMatrix::default(),
            veil: Diffuser::new(sr_real),
            bajo: BajoRack::new(sr_real),
            aura: AuraRack::new(sr_real),
            lyra: LyraRack::new(sr_real),
            tonos: TonosRack::new(sr_real),
            orch: OrchRack::new(),
            volta: VoltaRack::new(sr_real),
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
            excite: Vec::new(),
            frame_counter: 0,
            idle_frames: 0,
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

    /// Load a custom LFO breakpoint curve or step-sequencer lane from `upload[..count]`.
    pub fn set_lfo_custom(&mut self, slot: usize, count: usize, stepped: bool) {
        if slot >= NUM_LFO || count == 0 || count > self.upload.len() {
            return;
        }
        let slice = &self.upload[..count];
        self.lfos[slot].set_custom(slice, stepped);
        for v in self.voices.iter_mut() {
            v.lfos[slot].set_custom(slice, stepped);
        }
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

    /// SOMA deep skin: a SOMA strike plus its GPU-rendered upper membrane from `slot` at `gain`;
    /// the voice's noise cloud stops below `top_ratio` (× base pitch), where the real modes are.
    pub fn note_on_deep(&mut self, note: f32, vel: f32, voice_id: u32, frame_offset: u32, slot: i32, gain: f32, top_ratio: f32) {
        self.note_on(note, vel, voice_id, frame_offset);
        if let Some(v) = self.voices.iter_mut().filter(|v| v.active && v.voice_id == voice_id).max_by_key(|v| v.age) {
            // SOMA reads `top_ratio` as the cloud's new floor; TONOS reads it as the take (0/1).
            if !v.set_soma_deep(slot, gain, top_ratio) {
                v.set_tonos_deep(slot, gain, top_ratio.round().max(0.0) as u32, &self.params, &self.samples);
            }
        }
    }

    /// A TONOS note on this engine's parameters, as the GPU deep body needs it: the force the
    /// strings put on the bridge (`frames` samples — what drives the GPU's body modes), then the
    /// sound of the body's broad floors for the same note (`frames` more), then the rest of the body
    /// (`frames` more: the floors add to it coherently, and the deep body is matched to what they
    /// add). Played from `deep_seed(note, variant)`, as a deep note-on replays it.
    /// Main-thread use only: it allocates.
    pub fn tonos_excitation(&mut self, note: f32, vel: f32, variant: u32, frames: usize) -> &[f32] {
        let mut voice = crate::tonos::TonosVoice::new(self.sr);
        let mut rng = Rng(crate::tonos::deep_seed(note, variant));
        voice.trigger(crate::voice::midi_to_hz(note), vel.clamp(0.0, 1.0), &self.params, &mut rng);
        self.excite.clear();
        self.excite.resize(frames * 3, 0.0);
        for i in 0..frames {
            voice.render_sample(1.0, 0.0, &mut rng);
            self.excite[i] = voice.last_bridge_force;
            self.excite[frames + i] = voice.last_floor;
            self.excite[2 * frames + i] = voice.last_rest;
        }
        &self.excite
    }

    /// A SOMA strike on this engine's parameters, as the GPU deep skin needs it: the force the
    /// voice feeds its membrane modes (`frames` samples — what drives the thousands of GPU modes, so
    /// they hear the same contact, slap and rim wave as the 16 the CPU steps), then the noise
    /// cloud's output for the same strike (`frames` more — the level the deep skin is matched to).
    /// Main-thread use only: it allocates.
    pub fn soma_excitation(&mut self, note: f32, vel: f32, seed: u32, frames: usize) -> &[f32] {
        let mut voice = crate::soma::SomaVoice::new(self.sr);
        let mut rng = Rng(seed | 1);
        voice.trigger(crate::voice::midi_to_hz(note), vel.clamp(0.0, 1.0), &self.params, &mut rng);
        self.excite.clear();
        self.excite.resize(frames * 2, 0.0);
        for i in 0..frames {
            voice.render_sample(&self.params, 1.0, 0.0, &mut rng);
            self.excite[i] = voice.last_exciter_force;
            self.excite[frames + i] = voice.last_cloud;
        }
        &self.excite
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

    /// Set a parameter. Switching on an orchestra-family model allocates its voices here (at patch
    /// load), never while rendering.
    pub fn set_param(&mut self, id: u32, value: f32) {
        self.params.set(id, value);
        if crate::orch::is_enable(id) && value > 0.5 {
            self.ensure_orch();
        }
    }

    fn ensure_orch(&mut self) {
        let kind = crate::orch::kind_for(&self.params);
        if kind == crate::orch::KIND_NONE {
            return;
        }
        for v in self.voices.iter_mut() {
            v.orch.ensure(kind);
            v.orch.set_sample_rate(self.sr);
        }
        self.orch.ensure(kind);
    }

    /// Orchestra family: give the new voice its role (instrument, seat, players) and re-voice the
    /// chord it joins. Notes that start within 40 ms of each other are one chord: an ensemble deals
    /// them out top to bottom across its sections; a single section divides its players among the
    /// notes it holds (divisi).
    fn orch_assign(&mut self, kind: u8, new_idx: usize, note: f32) {
        use crate::orch::{assign_sections, ensemble, Role};
        let Some(e) = ensemble(kind, &self.params) else { return };
        let recent = (self.sr * 0.04) as u32;
        let mut idx = [0usize; MAX_VOICES];
        let mut notes = [0.0f32; MAX_VOICES];
        let mut n = 0;
        let mut held = 0;
        for (i, v) in self.voices.iter().enumerate() {
            if i == new_idx {
                continue;
            }
            if v.orch_held_kind(kind) {
                held += 1;
            }
            if let Some(nt) = v.orch_recent(kind, recent) {
                idx[n] = i;
                notes[n] = nt;
                n += 1;
            }
        }
        idx[n] = new_idx;
        notes[n] = note;
        n += 1;
        let mut order = [0usize; MAX_VOICES];
        for (k, o) in order.iter_mut().enumerate().take(n) {
            *o = k;
        }
        order[..n].sort_by(|&a, &b| notes[b].partial_cmp(&notes[a]).unwrap_or(core::cmp::Ordering::Equal));
        let mut sorted = [0.0f32; MAX_VOICES];
        for k in 0..n {
            sorted[k] = notes[order[k]];
        }
        let mut sec = [0usize; MAX_VOICES];
        assign_sections(&sorted[..n], &e, &mut sec[..n]);
        let mut per = [0usize; 5];
        for k in 0..n {
            per[sec[k].min(4)] += 1;
        }
        for k in 0..n {
            let s = sec[k].min(e.n.max(1) - 1);
            let divisi = if e.single { (held + 1).max(n) } else { per[s] };
            let sc = e.secs[s];
            let role = Role { inst: sc.inst, section: sc.seat, players: (sc.players / divisi.max(1)).max(1), bus: sc.bus };
            let vi = idx[order[k]];
            let changed = self.voices[vi].orch.set_role(role);
            if vi != new_idx && changed {
                let params = &self.params;
                self.voices[vi].orch_retrigger(params);
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
                    if !v.lyra_slur(note, vel, &self.params) && !v.tonos_slur(note, vel, &self.params) {
                        v.orch_slur(note, vel, &self.params);
                    }
                    return;
                }
                let sr = self.sr;
                let p = &self.params;
                v.note_on(note, vel, voice_id, p, Some(from), frame_offset, sr);
                v.age = self.age_counter;
                return;
            }
        }

        // LYRA's own legato for bowed/blown models in poly mode: a note that arrives while exactly
        // one note has been sounding for a while is a slur into it; notes that start together
        // (a chord, a double stop, a section pad) stay separate voices.
        if self.params.get(LYRA_BASE + LY_ENABLE) > 0.5 && self.params.get(LYRA_BASE + LY_LEGATO) > 0.5 {
            let min_age = (self.sr * 0.06) as u32;
            let mut held = self.voices.iter_mut().filter_map(|v| v.lyra_held().map(|t| (t, v)));
            if let (Some((t, v)), None) = (held.next(), held.next()) {
                if t > min_age {
                    v.note = note;
                    v.velocity = vel.clamp(0.0, 1.0);
                    v.voice_id = voice_id;
                    v.lyra_slur(note, vel, &self.params);
                    return;
                }
            }
        }

        // TONOS legato: a note into exactly one held string slides the stopping finger (a chord stays a chord).
        if self.params.get(TONOS_BASE + TN_ENABLE) > 0.5 && self.params.get(TONOS_BASE + TN_LEGATO) > 0.5 {
            let min_age = (self.sr * 0.06) as u32;
            let mut held = self.voices.iter_mut().filter_map(|v| v.tonos_held().map(|t| (t, v)));
            if let (Some((t, v)), None) = (held.next(), held.next()) {
                if t > min_age {
                    v.note = note;
                    v.velocity = vel.clamp(0.0, 1.0);
                    v.voice_id = voice_id;
                    v.tonos_slur(note, vel, &self.params);
                    return;
                }
            }
        }

        // Orchestra-family legato (single instrument): a note into exactly one held, sustained note
        // is one bow / one breath — the finger, valve or slide moves.
        let orch_kind = crate::orch::kind_for(&self.params);
        let arco_on = orch_kind == crate::orch::KIND_ARCO;
        if orch_kind != crate::orch::KIND_NONE && crate::orch::legato_on(orch_kind, &self.params) {
            let min_age = (self.sr * 0.06) as u32;
            let mut held = self.voices.iter_mut().filter_map(|v| v.orch_held().map(|t| (t, v)));
            if let (Some((t, v)), None) = (held.next(), held.next()) {
                if t > min_age {
                    v.note = note;
                    v.velocity = vel.clamp(0.0, 1.0);
                    v.voice_id = voice_id;
                    v.orch_slur(note, vel, &self.params);
                    return;
                }
            }
        }

        if self.params.get(VOLTA_BASE + VL_ENABLE) > 0.5 {
            let vmode = self.params.get(VOLTA_BASE + VL_VOICE_MODE).round() as u32;
            if vmode == 2 {
                if let Some(v) = self.voices.iter_mut().find(|v| v.active && !v.released && v.volta_probes().is_some()) {
                    v.velocity = vel.clamp(0.0, 1.0);
                    v.voice_id = voice_id;
                    v.volta_slur(note, &self.params);
                    return;
                }
            }
            if vmode >= 1 {
                for v in self.voices.iter_mut() {
                    if v.active && v.volta_probes().is_some() {
                        v.note_off();
                    }
                }
            }
        }
        let glide_from = if self.params.get(P_GLIDE) > 0.0005 || (self.params.get(VOLTA_BASE + VL_ENABLE) > 0.5 && self.params.get(VOLTA_BASE + VL_GLIDE) > 0.0005) {
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
        if orch_kind != crate::orch::KIND_NONE {
            // The role first (the trigger reads it), then the chord around it.
            self.orch_assign(orch_kind, idx, note);
        }
        let params = &self.params;
        let v = &mut self.voices[idx];
        v.note_on(note, vel, voice_id, params, glide_from, frame_offset, sr);
        v.age = age;
        if arco_on && self.params.get(ARCO_BASE + AR_BASS_OCTAVE) > 0.5 && self.params.get(ARCO_BASE + AR_ENSEMBLE) >= 1.5 {
            // Basses double the lowest cello note an octave down (same voice id: one note-off).
            let is_low_cello = self.voices[idx].orch.arco.as_ref().map(|a| a.role.section == 3).unwrap_or(false)
                && !self.voices.iter().enumerate().any(|(i, v)| i != idx && v.orch_held_kind(crate::orch::KIND_ARCO) && v.note < note);
            if is_low_cello && note - 12.0 >= 28.0 {
                if let Some(j) = self.voices.iter().position(|v| !v.active) {
                    let ens = self.params.get(ARCO_BASE + AR_ENSEMBLE).round() as usize;
                    let size = crate::arco::ensemble_sections(ens, true).0[4].2;
                    self.voices[j].orch.set_role(crate::orch::Role { inst: 3, section: 4, players: size, bus: 3 });
                    self.age_counter += 1;
                    let age2 = self.age_counter;
                    let params = &self.params;
                    let v2 = &mut self.voices[j];
                    v2.note_on(note - 12.0, vel, voice_id, params, None, frame_offset, sr);
                    v2.age = age2;
                }
            }
        }

        for (li, l) in self.lfos.iter_mut().enumerate() {
            if self.params.get(lfo_param(li, L_PER_VOICE)) <= 0.5 {
                l.retrigger_now(&mut self.rng);
            }
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
            self.events.clear();
            self.events_dirty = false;
            self.veil.clear();
            self.tonos.clear();
            self.bajo.clear();
            self.aura.clear();
            self.lyra.clear();
            self.volta.clear();
        }
    }

    pub fn active_voices(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    /// Live VOLTA circuit-node voltage/RMS telemetry (nodes 0..6: VCO, Wavefold, Ladder, SVF, Diode/Out, PSU Rail, Temp).
    pub fn volta_probe(&self, node: u32) -> f32 {
        let i = node as usize;
        if i < VOLTA_PROBE_COUNT { self.volta.last_probes[i] } else { 0.0 }
    }

    // ── Absolute-time scheduling (the offline-render path) ───────────────────

    pub fn schedule_note_on(&mut self, note: f32, velocity: f32, voice_id: u32, frame: f64) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: true, note, velocity, voice_id, slot: -1, detune_cents: 0.0, start_frame: 0.0, deep_gain: 0.0, deep_top: 0.0 });
        self.events_dirty = true;
    }

    /// The KERA twin of `schedule_note_on`: a sampled voice queued at an absolute frame, so a
    /// sampler track bounces offline exactly as it plays live.
    #[allow(clippy::too_many_arguments)]
    pub fn schedule_note_on_sampled(&mut self, note: f32, velocity: f32, voice_id: u32, frame: f64, slot: i32, detune_cents: f32, start_frame: f64) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: true, note, velocity, voice_id, slot, detune_cents, start_frame, deep_gain: 0.0, deep_top: 0.0 });
        self.events_dirty = true;
    }

    /// The SOMA deep twin of `schedule_note_on` (offline bounces).
    #[allow(clippy::too_many_arguments)]
    pub fn schedule_note_on_deep(&mut self, note: f32, velocity: f32, voice_id: u32, frame: f64, slot: i32, gain: f32, top_ratio: f32) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: true, note, velocity, voice_id, slot, detune_cents: 0.0, start_frame: 0.0, deep_gain: gain, deep_top: top_ratio.max(1e-3) });
        self.events_dirty = true;
    }

    pub fn schedule_note_off(&mut self, voice_id: u32, frame: f64) {
        if self.events.len() >= MAX_EVENTS || !frame.is_finite() {
            return;
        }
        self.events.push(ScheduledEvent { frame: frame.max(0.0) as u64, on: false, note: 0.0, velocity: 0.0, voice_id, slot: -1, detune_cents: 0.0, start_frame: 0.0, deep_gain: 0.0, deep_top: 0.0 });
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
            if ev.on && ev.slot >= 0 && ev.deep_top > 0.0 {
                self.note_on_deep(ev.note, ev.velocity, ev.voice_id, offset, ev.slot, ev.deep_gain, ev.deep_top);
            } else if ev.on && ev.slot >= 0 {
                self.note_on_sampled(ev.note, ev.velocity, ev.voice_id, offset, ev.slot, ev.detune_cents, ev.start_frame);
            } else if ev.on {
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

        // Idle skip. With no voice sounding and the output silent for half a second, every tail
        // (Veil, delay, ensemble, tape) has died away — running the racks over silence is pure
        // cost, and a song with a dozen pad instruments paid it for every one, every block. A
        // frozen Veil keeps sounding, so it never goes quiet enough to be skipped. The next note
        // wakes the engine (drain_events above activates its voice before this check).
        let any_voice = self.voices.iter().any(|v| v.active);
        if !any_voice && self.idle_frames >= (self.sr * 0.5) as u64 {
            self.frame_counter += frames as u64;
            return;
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
        // `veil`, `bajo` and `aura` come out in the same destructure because all three need
        // `scratch` and a second `let Engine { .. } = self` would be a double mutable borrow.
        let Engine { voices, lfos, scratch, params, matrix, tables, samples, sr, layout, position, veil, bajo, aura, lyra, tonos, orch, volta, .. } = self;
        let mut active_cnt = 0u32;
        orch.clear_bus(frames);
        for v in voices.iter_mut() {
            if v.active {
                active_cnt += 1;
                v.render(scratch, frames, params, matrix, &globals, lfos, bps, tables, samples, *sr, *layout, *position, &wf, orch.bus());
            }
        }
        orch.process(scratch, frames, nch, params, *sr);

        let mut vp_cnt = 0.0f32;
        let mut vp_acc = [0.0f32; VOLTA_PROBE_COUNT];
        for v in voices.iter() {
            if let Some(pr) = v.volta_probes() {
                vp_cnt += 1.0;
                for i in 0..5 {
                    vp_acc[i] = vp_acc[i].max(pr[i]);
                }
                vp_acc[5] += pr[5];
                vp_acc[6] += pr[6];
            }
        }
        if vp_cnt > 0.0 {
            volta.last_probes[..5].copy_from_slice(&vp_acc[..5]);
            volta.last_probes[5] = vp_acc[5] / vp_cnt;
            volta.last_probes[6] = vp_acc[6] / vp_cnt;
        } else {
            volta.last_probes[..5].fill(0.0);
            volta.last_probes[5] = 1.0;
            volta.last_probes[6] = params.get(VOLTA_BASE + VL_BIAS_TEMP);
        }
        if VoltaRack::active(params) {
            volta.process(scratch, frames, nch, params, active_cnt);
        }

        if LyraRack::active(params) {
            lyra.process(scratch, frames, nch, params);
        }
        if TonosRack::active(params) {
            tonos.process(scratch, frames, nch, params);
        }

        // AURA's vintage rack (VCA/LPG Gate → Phaser → BBD String Ensemble → 15 IPS Tape & Mains Floor).
        if AuraRack::active(params) {
            aura.process(scratch, frames, nch, params, active_cnt, beats, bps);
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
        let mut peak = 0.0f32;
        for c in 0..nch {
            for s in 0..frames {
                peak = peak.max(scratch[c][s].abs());
            }
        }
        if any_voice || peak > 1.0e-5 { self.idle_frames = 0; } else { self.idle_frames += frames as u64; }
        self.frame_counter += frames as u64;
        let _ = MAX_UNISON;
    }
}

#[cfg(test)]
mod tonos_deep_tests {
    use super::*;

    /// The recorder and a live engine voice play the same string: `tonos_excitation` and a deep
    /// note-on replay identical bridge forces, sample for sample.
    #[test]
    fn tonos_deep_recorder_matches_the_live_voice() {
        for (inst, note) in [(16.0f32, 64.0f32), (19.0, 57.0), (40.0, 60.0)] {
            let mut e = Engine::new(48000.0);
            e.params.set(TONOS_BASE + TN_ENABLE, 1.0);
            e.params.set(TONOS_BASE + TN_INSTRUMENT, inst);
            let n = 4096usize;
            let rec: Vec<f32> = e.tonos_excitation(note, 0.75, 0, n)[..n].to_vec();
            // A slot of silence, long enough.
            e.sample_begin(0, 48000, 2, 48000.0, 60.0, 0, 0, 0);
            e.sample_end(0);
            e.note_on_deep(note, 0.75, 1, 0, 0, 1.0, 0.0);
            let mut live = Vec::with_capacity(n);
            for _ in 0..n / 64 {
                e.render(64);
                // The probe reads the last sample of each block; record those.
                let v = e.voices.iter().find(|v| v.active).expect("voice");
                live.push(v.tonos_probe().0);
            }
            for (k, f) in live.iter().enumerate() {
                assert_eq!(*f, rec[k * 64 + 63], "inst {inst}: bridge force differs at block {k}");
            }
        }
    }
}
