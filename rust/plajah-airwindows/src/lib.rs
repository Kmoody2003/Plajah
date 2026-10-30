// Airwindows for the MEKA insert rack — Chris Johnson's effects (MIT, see LICENSE), ported to
// Rust. One wasm instance hosts ONE effect: the worklet (airwindows.worklet.js) instantiates
// the shared module per insert, so every device gets its own linear memory and nothing is
// shared across the thread boundary. Flat extern "C", no allocation on the audio thread after
// aw_init.

pub mod common;
pub mod plugins;

use plugins::Plugin;

/// Bump when the exported functions or the kind table change shape.
pub const ABI_VERSION: u32 = 1;
/// Largest block the host may pass to aw_process (WebAudio renders 128).
pub const MAX_BLOCK: usize = 512;

struct Host {
    fx: Option<Box<dyn Plugin>>,
    l: [f32; MAX_BLOCK],
    r: [f32; MAX_BLOCK],
}

static mut HOST: Host = Host { fx: None, l: [0.0; MAX_BLOCK], r: [0.0; MAX_BLOCK] };

#[inline(always)]
fn host() -> &'static mut Host {
    // Single-threaded by construction: one wasm instance per AudioWorkletProcessor.
    unsafe { &mut *(&raw mut HOST) }
}

#[unsafe(no_mangle)]
pub extern "C" fn aw_abi_version() -> u32 { ABI_VERSION }

/// Number of kinds this build knows (the host checks its catalog against it).
#[unsafe(no_mangle)]
pub extern "C" fn aw_kind_count() -> u32 { plugins::KINDS.len() as u32 }

/// Create the effect. Returns its parameter count, or 0 for an unknown kind.
#[unsafe(no_mangle)]
pub extern "C" fn aw_init(kind: u32, sample_rate: f32, seed_l: u32, seed_r: u32) -> u32 {
    let h = host();
    h.fx = plugins::create(kind, sample_rate as f64, seed_l, seed_r);
    match h.fx {
        Some(_) => plugins::KINDS.iter().find(|k| k.0 == kind).map(|k| k.2 as u32).unwrap_or(0),
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn aw_set_param(index: u32, value: f32) {
    if let Some(fx) = host().fx.as_mut() { fx.set_param(index as usize, value.clamp(0.0, 1.0)); }
}

/// Channel buffer the host writes input into and reads output from (0 = L, 1 = R).
#[unsafe(no_mangle)]
pub extern "C" fn aw_buf(channel: u32) -> *mut f32 {
    let h = host();
    if channel == 0 { h.l.as_mut_ptr() } else { h.r.as_mut_ptr() }
}

/// Process `frames` samples in place in the channel buffers.
#[unsafe(no_mangle)]
pub extern "C" fn aw_process(frames: u32) {
    let h = host();
    let n = (frames as usize).min(MAX_BLOCK);
    if let Some(fx) = h.fx.as_mut() {
        fx.process(&mut h.l[..n], &mut h.r[..n]);
        // A port must never hand NaN/inf to the graph — one bad sample latches a WebAudio
        // biquad downstream into silence for the rest of the session.
        for s in h.l[..n].iter_mut().chain(h.r[..n].iter_mut()) {
            if !s.is_finite() { *s = 0.0; }
        }
    }
}
