//! Flat C ABI for the desktop host (windows-native/Plajah.WinUI/NativeAudioBridge.cs).

use crate::session::{Cmd, Session};
use std::time::Duration;

/// Bump when this ABI changes, so the app refuses a stale DLL.
pub const PAH_ABI_VERSION: u32 = 1;

#[unsafe(no_mangle)]
pub extern "C" fn pah_abi_version() -> u32 {
    PAH_ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pah_session_new(sample_rate: f32, threads: u32) -> *mut Session {
    Box::into_raw(Box::new(Session::new(sample_rate, threads as usize)))
}

/// # Safety
/// `s` came from `pah_session_new` and no other call is running on it.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_session_free(s: *mut Session) {
    if !s.is_null() {
        drop(unsafe { Box::from_raw(s) });
    }
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_track_add(s: *mut Session) -> u32 {
    unsafe { &*s }.add_track()
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_track_remove(s: *mut Session, track: u32) {
    unsafe { &*s }.remove_track(track)
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_clock(s: *mut Session, frame: f64) {
    unsafe { &*s }.clock(frame.max(0.0) as u64)
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_param(s: *mut Session, track: u32, id: u32, value: f32) {
    unsafe { &*s }.command(track, Cmd::Param { id, value })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_note_on(s: *mut Session, track: u32, note: f32, velocity: f32, voice: u32, frame: f64) {
    unsafe { &*s }.command(track, Cmd::On { note, velocity, voice, frame })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_note_off(s: *mut Session, track: u32, voice: u32, frame: f64) {
    unsafe { &*s }.command(track, Cmd::Off { voice, frame })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_all_off(s: *mut Session, track: u32, hard: u32) {
    unsafe { &*s }.command(track, Cmd::AllOff { hard: hard != 0 })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_macro(s: *mut Session, track: u32, index: u32, value: f32) {
    unsafe { &*s }.command(track, Cmd::Macro { index, value })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_route(s: *mut Session, track: u32, index: u32, source: u32, dest: u32, depth: f32, via: u32) {
    unsafe { &*s }.command(track, Cmd::Route { index, source, dest, depth, via })
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_mod_wheel(s: *mut Session, track: u32, value: f32) {
    unsafe { &*s }.command(track, Cmd::ModWheel(value))
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_pitch_bend(s: *mut Session, track: u32, value: f32) {
    unsafe { &*s }.command(track, Cmd::PitchBend(value))
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_tempo(s: *mut Session, track: u32, value: f32) {
    unsafe { &*s }.command(track, Cmd::Tempo(value))
}

/// # Safety
/// `s` is a live session.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_expression(s: *mut Session, track: u32, voice: u32, bend: f32, pressure: f32, timbre: f32) {
    unsafe { &*s }.command(track, Cmd::Expression { voice, bend, pressure, timbre })
}

/// Copies the next chunk into `out`. Returns its size in bytes, 0 if none came within `timeout_ms`.
///
/// # Safety
/// `s` is a live session; `out` holds `capacity` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_next_chunk(s: *mut Session, out: *mut u8, capacity: u32, timeout_ms: u32) -> u32 {
    let Some(chunk) = unsafe { &*s }.next_chunk(Duration::from_millis(timeout_ms as u64)) else { return 0 };
    let n = chunk.len().min(capacity as usize);
    unsafe { std::ptr::copy_nonoverlapping(chunk.as_ptr(), out, n) };
    n as u32
}

/// # Safety
/// `s` is a live session; the out pointers are valid.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pah_stats(s: *mut Session, chunks: *mut u64, late_notes: *mut u64, jumps: *mut u64) {
    use std::sync::atomic::Ordering::Relaxed;
    let st = unsafe { &*s }.stats();
    unsafe {
        *chunks = st.chunks.load(Relaxed);
        *late_notes = st.late_notes.load(Relaxed);
        *jumps = st.jumps.load(Relaxed);
    }
}
