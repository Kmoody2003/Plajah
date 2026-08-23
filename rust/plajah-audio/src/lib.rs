//! plajah-audio — the DSP core for Melos instruments (ONDA, and later KERA / FONDO).
//!
//! Compiled to `wasm32-unknown-unknown` as a bare `cdylib` and instantiated inside an
//! AudioWorklet. Deliberately no wasm-bindgen: the worklet talks to this flat `extern "C"` ABI,
//! so nothing marshals, nothing allocates and nothing garbage-collects on the audio thread.
//!
//! This file is the ABI surface only — all logic lives in the modules.

mod diffuser;
mod engine;
mod env;
mod exciter;
mod filter;
mod lfo;
mod modal;
mod modmatrix;
mod osc;
mod params;
mod shaper;
mod sample;
mod spatial;
mod tables;
mod voice;

use engine::Engine;
use spatial::{IamfRole, Layout, Position};

/// Bump when the ABI changes so the host can refuse a stale committed `.wasm`.
/// v2 adds absolute-frame scheduling (`pa_schedule_note_*`), which is what makes offline
/// rendering of instrument tracks possible. v3 adds sample playback (KERA). v5 adds VELA — the
/// modal body, the exciter and the Veil (param block 1000+), plus the Tide LFO shape and the
/// slow LFO range. v6 adds VELA's life controls — per-partial Anima drift, singing-bowl Beat,
/// and the exciter's breath Pulse. v7 adds Swell, Morph, and the two that matter most —
/// a Sustained bank mode (driven partials rather than excited resonators) and absolute-frequency
/// formants, which together are what let the instrument be something other than a struck body. Additive ids, but a stale .wasm would ignore them silently,
/// which is exactly what this guard exists to prevent.
pub const ABI_VERSION: u32 = 7;

#[unsafe(no_mangle)]
pub extern "C" fn pa_abi_version() -> u32 {
    ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pa_create(sample_rate: f32) -> *mut Engine {
    Box::into_raw(Box::new(Engine::new(sample_rate)))
}

/// # Safety
/// `p` must come from `pa_create` and must not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_destroy(p: *mut Engine) {
    if !p.is_null() {
        drop(unsafe { Box::from_raw(p) });
    }
}

macro_rules! eng {
    ($p:expr) => {
        match unsafe { $p.as_mut() } {
            Some(e) => e,
            None => return,
        }
    };
    ($p:expr, $ret:expr) => {
        match unsafe { $p.as_mut() } {
            Some(e) => e,
            None => return $ret,
        }
    };
}

/// Pointer to one channel of the render scratch. Stable for the engine's lifetime, so the host
/// creates its `Float32Array` views once.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_out_ptr(p: *mut Engine, channel: u32) -> *mut f32 {
    let e = eng!(p, core::ptr::null_mut());
    e.scratch_ptr(channel as usize)
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_render(p: *mut Engine, frames: u32) {
    let e = eng!(p);
    e.render(frames as usize);
}

/// `frame_offset` delays the note by N samples inside this block — how an asynchronous
/// `postMessage` still produces a sample-accurate note start.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_note_on(p: *mut Engine, note: f32, velocity: f32, voice_id: u32, frame_offset: u32) {
    let e = eng!(p);
    e.note_on(note, velocity, voice_id, frame_offset);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_note_off(p: *mut Engine, voice_id: u32) {
    let e = eng!(p);
    e.note_off(voice_id);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_all_notes_off(p: *mut Engine, hard: u32) {
    let e = eng!(p);
    e.all_notes_off(hard != 0);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_param(p: *mut Engine, id: u32, value: f32) {
    let e = eng!(p);
    e.params.set(id, value);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_macro(p: *mut Engine, index: u32, value: f32) {
    let e = eng!(p);
    e.set_macro(index as usize, value);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_route(p: *mut Engine, index: u32, source: u32, dest: u32, depth: f32, via: u32) {
    let e = eng!(p);
    e.set_route(index as usize, source, dest, depth, via);
}

/// Per-note expression (MPE): pitch bend -1..1, pressure 0..1, timbre/slide 0..1.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_expression(p: *mut Engine, voice_id: u32, bend: f32, pressure: f32, timbre: f32) {
    let e = eng!(p);
    e.set_expression(voice_id, bend, pressure, timbre);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_mod_wheel(p: *mut Engine, value: f32) {
    let e = eng!(p);
    e.set_mod_wheel(value);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_pitch_bend(p: *mut Engine, value: f32) {
    let e = eng!(p);
    e.set_global_bend(value);
}

/// Spatial source position, in the platform's `[x, y, z]` convention.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_position(p: *mut Engine, x: f32, y: f32, z: f32) {
    let e = eng!(p);
    e.position = Position { x, y, z };
}

/// Output layout: 0 stereo, 1 quad, 2 5.1, 3 7.1.4, 4 first-order ambisonic.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_layout(p: *mut Engine, layout: u32) {
    let e = eng!(p);
    e.layout = Layout::from_index(layout);
}

/// IAMF role: 0 = scene/bed, 1 = object.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_iamf_role(p: *mut Engine, role: u32) {
    let e = eng!(p);
    e.iamf_role = if role == 0 { IamfRole::Scene } else { IamfRole::Object };
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_channels(p: *mut Engine) -> u32 {
    let e = eng!(p, 2);
    e.layout.channels() as u32
}

/// Tempo, so synced LFOs follow the transport.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_set_tempo(p: *mut Engine, beats_per_sec: f32) {
    let e = eng!(p);
    if beats_per_sec.is_finite() && beats_per_sec > 0.0 {
        e.beats_per_sec = beats_per_sec;
    }
}

/// Staging buffer the host writes raw wavetable frames into before `pa_commit_table`.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_upload_ptr(p: *mut Engine) -> *mut f32 {
    let e = eng!(p, core::ptr::null_mut());
    e.upload_ptr()
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_upload_capacity(p: *mut Engine) -> u32 {
    let e = eng!(p, 0);
    e.upload_capacity() as u32
}

/// Build the band-limited mip pyramid for a table slot from the staged data. Expensive and
/// therefore never called from the render path — the host does this at patch-load time.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_commit_table(p: *mut Engine, slot: u32, frames: u32, frame_size: u32) {
    let e = eng!(p);
    e.commit_table(slot as usize, frames as usize, frame_size as usize);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_active_voices(p: *mut Engine) -> u32 {
    let e = eng!(p, 0);
    e.active_voices()
}

/// Load a sample into a slot from the upload staging buffer (channel-major layout).
/// loop_mode: 0 off, 1 forward, 2 sustain.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn pa_load_sample(
    p: *mut Engine, slot: u32, frames: u32, channels: u32, sample_rate: f32,
    root_note: f32, loop_start: u32, loop_end: u32, loop_mode: u32,
) {
    let e = eng!(p);
    e.load_sample(slot as usize, frames as usize, channels as usize, sample_rate, root_note, loop_start as usize, loop_end as usize, loop_mode);
}

/// Chunked sample upload — the path the host uses so a sample of any length loads through the
/// small staging buffer. `begin` allocates, `chunk` fills from the staging buffer at a flat
/// channel-major offset, `end` makes it playable.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn pa_sample_begin(
    p: *mut Engine, slot: u32, frames: u32, channels: u32, sample_rate: f32,
    root_note: f32, loop_start: u32, loop_end: u32, loop_mode: u32,
) {
    let e = eng!(p);
    e.sample_begin(slot as usize, frames as usize, channels as usize, sample_rate, root_note, loop_start as usize, loop_end as usize, loop_mode);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_sample_chunk(p: *mut Engine, slot: u32, offset: u32, len: u32) {
    let e = eng!(p);
    e.sample_chunk(slot as usize, offset as usize, len as usize);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_sample_end(p: *mut Engine, slot: u32) {
    let e = eng!(p);
    e.sample_end(slot as usize);
}

/// Play a note from a loaded sample slot — the KERA note-on. `detune_cents` folds in a zone's
/// tuning; `start_frame` honours a play-start offset.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_note_on_sampled(p: *mut Engine, note: f32, velocity: f32, voice_id: u32, frame_offset: u32, slot: i32, detune_cents: f32, start_frame: f64) {
    let e = eng!(p);
    e.note_on_sampled(note, velocity, voice_id, frame_offset, slot, detune_cents, start_frame);
}

/// Queue a note at an ABSOLUTE sample position. Live playback can use `pa_note_on` with a
/// block-relative offset; an offline render must post everything up front and let the engine's
/// own frame counter fire it, because rendering outruns message delivery.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_schedule_note_on(p: *mut Engine, note: f32, velocity: f32, voice_id: u32, frame: f64) {
    let e = eng!(p);
    e.schedule_note_on(note, velocity, voice_id, frame);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_schedule_note_off(p: *mut Engine, voice_id: u32, frame: f64) {
    let e = eng!(p);
    e.schedule_note_off(voice_id, frame);
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_clear_schedule(p: *mut Engine) {
    let e = eng!(p);
    e.clear_schedule();
}

/// Rewind the engine's sample clock — called once before an offline render.
///
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pa_reset_transport(p: *mut Engine, frame: f64) {
    let e = eng!(p);
    e.reset_transport(frame);
}
