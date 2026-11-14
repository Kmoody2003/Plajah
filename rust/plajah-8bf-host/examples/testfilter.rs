//! A tiny filter for testing the host. Inverts RGB in 64x64 tiles, using advanceState,
//! the handle suite for parameters, and the buffer suite. No PiPL, so call it with
//! `entry: "PluginMain"`. TESTFILTER_MODE=crash|error|cancel|stackoverflow|suite|print
//! exercises the failure paths.
#![allow(dead_code, non_snake_case, clippy::all)]
#[path = "../src/sdk.rs"]
mod sdk;
use sdk::*;
use std::ffi::c_void;

const MARK: [u8; 4] = *b"TEST";

fn mode() -> String { std::env::var("TESTFILTER_MODE").unwrap_or_default() }

#[inline(never)]
#[allow(unconditional_recursion)]
fn recurse(n: u64) -> u64 {
    let pad = [n; 512];
    std::hint::black_box(&pad);
    recurse(n + 1) + std::hint::black_box(pad[3])
}

#[unsafe(no_mangle)]
pub unsafe extern "system" fn PluginMain(selector: i16, block: *mut c_void, data: *mut isize, result: *mut i16) {
    unsafe {
        *result = NO_ERR;
        let r = &mut *(block as *mut FilterRecord);
        match selector {
            SEL_PARAMETERS => {
                let procs = &*r.handleProcs;
                let h = (procs.new)(8);
                let p = (procs.lock)(h, 0);
                std::ptr::copy_nonoverlapping(MARK.as_ptr(), p, 4);
                *(p.add(4) as *mut i32) = (r.planes as i32) * 1000;
                (procs.unlock)(h);
                r.parameters = h;
                *data = 0x1234;
            }
            SEL_PREPARE => {
                r.bufferSpace = 0;
                let buffers = &*r.bufferProcs;
                let mut id = std::ptr::null_mut();
                if (buffers.allocate)(4096, &mut id) != 0 { *result = MEM_FULL; return; }
                (buffers.lock)(id, 0).write_bytes(0xAB, 4096);
                (buffers.unlock)(id);
                (buffers.free)(id);
            }
            SEL_START => {
                match mode().as_str() {
                    "crash" => { std::ptr::write_volatile(8 as *mut u32, 1); }
                    "stackoverflow" => { std::hint::black_box(recurse(0)); }
                    "error" => {
                        let msg = b"\x0ctest failure";
                        std::ptr::copy_nonoverlapping(msg.as_ptr(), r.errorString, msg.len());
                        *result = ERR_REPORT_STRING;
                        return;
                    }
                    "cancel" => { *result = USER_CANCELED; return; }
                    "print" => { println!("noise on stdout"); }
                    "suite" => {
                        let mut suite = std::ptr::null();
                        let e = ((*r.sSPBasic).acquire)(b"Test Missing Suite\0".as_ptr() as *const _, 2, &mut suite);
                        if e != SP_SUITE_NOT_FOUND || !suite.is_null() { *result = FILTER_BAD_PARAMETERS; return; }
                    }
                    _ => {}
                }
                *data = 0x5678;
                r.inLoPlane = 0; r.inHiPlane = 2; r.outLoPlane = 0; r.outHiPlane = 2;
                set_tile(r, 0);
            }
            SEL_CONTINUE => {
                let inRect = r.inRect;
                let (w, h) = ((inRect.right - inRect.left) as usize, (inRect.bottom - inRect.top) as usize);
                for y in 0..h {
                    let src = r.inData.add(y * r.inRowBytes as usize);
                    let dst = r.outData.add(y * r.outRowBytes as usize);
                    for i in 0..w * 3 { *dst.add(i) = 255 - *src.add(i); }
                }
                let size = r.imageSize;
                ((std::mem::transmute::<usize, unsafe extern "system" fn(i32, i32)>(r.progressProc)))(inRect.top as i32, size.v as i32);
                let abort: unsafe extern "system" fn() -> u8 = std::mem::transmute(r.abortProc);
                if abort() != 0 { *result = USER_CANCELED; return; }
                let next = inRect.left as i32 + 64;
                if next < size.h as i32 {
                    r.inRect.left = next as i16;
                    r.inRect.right = (next + 64).min(size.h as i32) as i16;
                    r.outRect = r.inRect;
                } else {
                    set_tile(r, inRect.top as i32 + 64);
                }
            }
            SEL_FINISH => {
                if *data != 0x5678 { *result = FILTER_BAD_PARAMETERS; }
            }
            _ => {}
        }
    }
}

fn set_tile(r: &mut FilterRecord, top: i32) {
    let size = r.imageSize;
    if top >= size.v as i32 {
        r.inRect = Rect16::default();
        r.outRect = Rect16::default();
        return;
    }
    r.inRect = Rect16 { top: top as i16, left: 0, bottom: (top + 64).min(size.v as i32) as i16, right: 64.min(size.h as i32) as i16 };
    r.outRect = r.inRect;
}
