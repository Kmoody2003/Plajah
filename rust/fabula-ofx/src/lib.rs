//! fabula-ofx — the OpenFX shell for Fabula Forge (see Cargo.toml description).
//!
//! Exports the two symbols every OFX host looks for. The plugin table and descriptors are
//! generated into `manifest_gen.rs` by `npm run ofx:manifest` (one entry function per plugin).
//! Build: `cargo check` works anywhere; producing the .ofx bundle needs a native linker
//! (MSVC Build Tools on Windows, clang on macOS/Linux): `cargo build --release`, then rename
//! `fabula_ofx.dll` / `libfabula_ofx.so` / `.dylib` to `FabulaForge.ofx` inside
//! `FabulaForge.ofx.bundle/Contents/<Win64|Linux-x86-64|MacOS>/`.
pub mod ofx;
pub mod shell;
pub mod manifest_gen;

use ofx::OfxPlugin;
use std::os::raw::c_int;

#[no_mangle]
pub extern "C" fn OfxGetNumberOfPlugins() -> c_int { manifest_gen::PLUGIN_COUNT as c_int }

#[no_mangle]
pub extern "C" fn OfxGetPlugin(n: c_int) -> *const OfxPlugin {
    let table = manifest_gen::PLUGIN_TABLE;
    if n < 0 || (n as usize) >= table.len() { return std::ptr::null(); }
    table[n as usize] as *const OfxPlugin
}
