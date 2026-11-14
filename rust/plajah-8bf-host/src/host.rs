//! The host side of the Filter plug-in API. A run owns one RGBA image; the plug-in
//! pulls rectangles of it through advanceState and writes results back the same way.
use crate::sdk::*;
use std::collections::HashSet;
use std::ffi::{CStr, c_char, c_void};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::System::LibraryLoader::*;
use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

pub static ABORT: AtomicBool = AtomicBool::new(false);
pub static MAIN_THREAD: AtomicU32 = AtomicU32::new(0);
/// Which selector is on the stack, so a crash report can name it.
pub static PHASE: Mutex<&'static str> = Mutex::new("idle");

/// What the plug-in asked for that this host does not provide.
pub static DENIED_SUITES: Mutex<Vec<String>> = Mutex::new(Vec::new());
pub static DENIED_PROCS: Mutex<Vec<String>> = Mutex::new(Vec::new());
fn note(list: &Mutex<Vec<String>>, what: String) {
    if let Ok(mut l) = list.lock() { if !l.contains(&what) { l.push(what); } }
}

// ── Memory ───────────────────────────────────────────────────────────────────
// Blocks carry a 16-byte size header, so no lookup table is needed for buffers.

const HEADER: usize = 16;
fn layout(size: usize) -> Option<std::alloc::Layout> {
    std::alloc::Layout::from_size_align(size.checked_add(HEADER)?, 16).ok()
}
unsafe fn block_alloc(size: usize) -> *mut u8 {
    let Some(l) = layout(size) else { return std::ptr::null_mut() };
    unsafe {
        let p = std::alloc::alloc_zeroed(l);
        if p.is_null() { return p; }
        *(p as *mut usize) = size;
        p.add(HEADER)
    }
}
unsafe fn block_size(p: *mut u8) -> usize { unsafe { *(p.sub(HEADER) as *const usize) } }
unsafe fn block_free(p: *mut u8) {
    if p.is_null() { return; }
    unsafe {
        let size = block_size(p);
        std::alloc::dealloc(p.sub(HEADER), layout(size).unwrap());
    }
}

// Buffer suite: the BufferID is the block pointer.
unsafe extern "system" fn buffer_allocate(size: i32, id: *mut *mut u8) -> OsErr { unsafe { buffer_allocate64(size as i64, id) } }
unsafe extern "system" fn buffer_allocate64(size: i64, id: *mut *mut u8) -> OsErr {
    if size < 0 || id.is_null() { return MEM_FULL; }
    unsafe {
        let p = block_alloc(size as usize);
        *id = p;
        if p.is_null() { MEM_FULL } else { NO_ERR }
    }
}
unsafe extern "system" fn buffer_lock(id: *mut u8, _high: u8) -> *mut u8 { id }
unsafe extern "system" fn buffer_unlock(_id: *mut u8) {}
unsafe extern "system" fn buffer_free(id: *mut u8) { unsafe { block_free(id) } }
unsafe extern "system" fn buffer_space() -> i32 { 1 << 30 }
unsafe extern "system" fn buffer_space64() -> i64 { 8 << 30 }
unsafe extern "system" fn buffer_reserve(_size: i32) {}

// Handle suite: a Handle is a pointer to the data pointer, so plug-ins that
// dereference it directly work. Handles the host did not make are treated as HGLOBAL,
// which older Windows plug-ins hand back for their parameters.
#[repr(C)]
struct PsHandle { data: *mut u8 }
static HANDLES: Mutex<Option<HashSet<usize>>> = Mutex::new(None);
fn is_ours(h: Handle) -> bool {
    HANDLES.lock().map(|g| g.as_ref().is_some_and(|s| s.contains(&(h as usize)))).unwrap_or(false)
}

pub unsafe extern "system" fn handle_new(size: i32) -> Handle {
    if size < 0 { return std::ptr::null_mut(); }
    unsafe {
        let data = block_alloc(size as usize);
        if data.is_null() { return std::ptr::null_mut(); }
        let h = Box::into_raw(Box::new(PsHandle { data })) as Handle;
        if let Ok(mut g) = HANDLES.lock() { g.get_or_insert_with(HashSet::new).insert(h as usize); }
        h
    }
}
unsafe extern "system" fn handle_dispose(h: Handle) {
    if h.is_null() { return; }
    unsafe {
        if is_ours(h) {
            if let Ok(mut g) = HANDLES.lock() { g.get_or_insert_with(HashSet::new).remove(&(h as usize)); }
            let b = Box::from_raw(h as *mut PsHandle);
            block_free(b.data);
        } else {
            GlobalFree(h as _);
        }
    }
}
unsafe extern "system" fn handle_get_size(h: Handle) -> i32 {
    if h.is_null() { return 0; }
    unsafe { if is_ours(h) { block_size(*h) as i32 } else { GlobalSize(h as _) as i32 } }
}
unsafe extern "system" fn handle_set_size(h: Handle, size: i32) -> OsErr {
    if h.is_null() || size < 0 || !is_ours(h) { return MEM_FULL; }
    unsafe {
        let old = *h;
        let new = block_alloc(size as usize);
        if new.is_null() { return MEM_FULL; }
        std::ptr::copy_nonoverlapping(old, new, block_size(old).min(size as usize));
        block_free(old);
        *h = new;
    }
    NO_ERR
}
unsafe extern "system" fn handle_lock(h: Handle, _high: u8) -> *mut u8 {
    if h.is_null() { return std::ptr::null_mut(); }
    unsafe { if is_ours(h) { *h } else { GlobalLock(h as _) as *mut u8 } }
}
unsafe extern "system" fn handle_unlock(h: Handle) {
    if !h.is_null() && !is_ours(h) { unsafe { GlobalUnlock(h as _); } }
}
unsafe extern "system" fn handle_recover(_size: i32) {}

/// Copy out a handle's bytes, whichever allocator it came from.
pub unsafe fn handle_bytes(h: Handle) -> Vec<u8> {
    if h.is_null() { return Vec::new(); }
    unsafe {
        let size = handle_get_size(h);
        let p = handle_lock(h, 0);
        let out = if p.is_null() || size <= 0 { Vec::new() } else { std::slice::from_raw_parts(p, size as usize).to_vec() };
        handle_unlock(h);
        out
    }
}

// ── PICA ─────────────────────────────────────────────────────────────────────
// No suites are offered. Every request is recorded so an error can say what was wanted.

unsafe extern "system" fn sp_acquire(name: *const c_char, version: i32, suite: *mut *const c_void) -> i32 {
    unsafe {
        if !suite.is_null() { *suite = std::ptr::null(); }
        let n = if name.is_null() { "<null>".into() } else { CStr::from_ptr(name).to_string_lossy().to_string() };
        note(&DENIED_SUITES, format!("{n} v{version}"));
    }
    SP_SUITE_NOT_FOUND
}
unsafe extern "system" fn sp_release(_: *const c_char, _: i32) -> i32 { 0 }
unsafe extern "system" fn sp_is_equal(a: *const c_char, b: *const c_char) -> i32 {
    if a.is_null() || b.is_null() { return 0; }
    unsafe { (CStr::from_ptr(a) == CStr::from_ptr(b)) as i32 }
}
unsafe extern "system" fn sp_alloc(size: usize, out: *mut *mut c_void) -> i32 {
    unsafe {
        let p = block_alloc(size);
        *out = p as *mut c_void;
        if p.is_null() { -108 } else { 0 }
    }
}
unsafe extern "system" fn sp_free(p: *mut c_void) -> i32 { unsafe { block_free(p as *mut u8); } 0 }
unsafe extern "system" fn sp_realloc(p: *mut c_void, size: usize, out: *mut *mut c_void) -> i32 {
    unsafe {
        let new = block_alloc(size);
        if new.is_null() { return -108; }
        if !p.is_null() {
            std::ptr::copy_nonoverlapping(p as *const u8, new, block_size(p as *mut u8).min(size));
            block_free(p as *mut u8);
        }
        *out = new as *mut c_void;
    }
    0
}
unsafe extern "system" fn sp_undefined() -> i32 { 0 }

static SP_BASIC: SpBasicSuite = SpBasicSuite {
    acquire: sp_acquire, release: sp_release, is_equal: sp_is_equal,
    allocate: sp_alloc, free: sp_free, reallocate: sp_realloc, undefined: sp_undefined,
};

// ── Stubs for optional suites ────────────────────────────────────────────────

unsafe extern "system" fn res_count(_: u32) -> i16 { 0 }
unsafe extern "system" fn res_get(_: u32, _: i16) -> Handle { std::ptr::null_mut() }
unsafe extern "system" fn res_delete(_: u32, _: i16) {}
unsafe extern "system" fn res_add(_: u32, _: Handle) -> OsErr { note(&DENIED_PROCS, "resourceProcs.add".into()); ERR_HOST_INSUFFICIENT }
unsafe extern "system" fn port_read() -> OsErr { note(&DENIED_PROCS, "channelPorts.readPixels".into()); ERR_HOST_INSUFFICIENT }
unsafe extern "system" fn port_write() -> OsErr { note(&DENIED_PROCS, "channelPorts.writeBasePixels".into()); ERR_HOST_INSUFFICIENT }
unsafe extern "system" fn port_rfw() -> OsErr { note(&DENIED_PROCS, "channelPorts.readPortForWritePort".into()); ERR_HOST_INSUFFICIENT }
unsafe extern "system" fn color_services(_: *mut c_void) -> OsErr { note(&DENIED_PROCS, "colorServices".into()); ERR_HOST_INSUFFICIENT }
unsafe extern "system" fn host_proc(_selector: i16, _data: *mut isize) {}
unsafe extern "system" fn process_event(_event: *mut c_void) {}

const fn cc(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
unsafe extern "system" fn property_get(_sig: u32, key: u32, _index: i32, simple: *mut isize, complex: *mut Handle) -> OsErr {
    let channels = current().map(|s| s.planes as isize).unwrap_or(3);
    unsafe {
        if !complex.is_null() { *complex = std::ptr::null_mut(); }
        let value = match key {
            k if k == cc(b"nuch") => channels,
            k if k == cc(b"mode") => MODE_RGB as isize,
            _ => {
                let name = String::from_utf8_lossy(&key.to_be_bytes()).to_string();
                note(&DENIED_PROCS, format!("property '{name}'"));
                return ERR_PROPERTY_UNDEFINED;
            }
        };
        if !simple.is_null() { *simple = value; }
    }
    NO_ERR
}
unsafe extern "system" fn property_set(_: u32, _: u32, _: i32, _: isize, _: Handle) -> OsErr { ERR_PROPERTY_UNDEFINED }

/// Returns null, false or noErr, whichever the slot means: openRead yields no token and
/// getKey yields no keys, so a filter's read loop ends at once.
unsafe extern "system" fn descriptor_noop() -> usize { 0 }
static READ_DESCRIPTOR_PROCS: DescriptorProcs = DescriptorProcs { version: 0, count: 18, procs: [descriptor_noop; 24] };
static WRITE_DESCRIPTOR_PROCS: DescriptorProcs = DescriptorProcs { version: 0, count: 16, procs: [descriptor_noop; 24] };

static BUFFER_PROCS: BufferProcs = BufferProcs {
    version: 2, count: 8, allocate: buffer_allocate, lock: buffer_lock, unlock: buffer_unlock,
    free: buffer_free, space: buffer_space, reserve: buffer_reserve,
    allocate64: buffer_allocate64, space64: buffer_space64,
};
static HANDLE_PROCS: HandleProcs = HandleProcs {
    version: 1, count: 8, new: handle_new, dispose: handle_dispose, get_size: handle_get_size,
    set_size: handle_set_size, lock: handle_lock, unlock: handle_unlock,
    recover_space: handle_recover, dispose_regular: handle_dispose,
};
static RESOURCE_PROCS: ResourceProcs = ResourceProcs { version: 3, count: 4, count_proc: res_count, get: res_get, delete: res_delete, add: res_add };
static PROPERTY_PROCS: PropertyProcs = PropertyProcs { version: 1, count: 2, get: property_get, set: property_set };
static CHANNEL_PORT_PROCS: ChannelPortProcs = ChannelPortProcs { version: 1, count: 3, read_pixels: port_read, write_base_pixels: port_write, read_port_for_write_port: port_rfw };

// ── Progress, abort, preview ─────────────────────────────────────────────────

pub fn pump_messages() {
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn abort_proc() -> u8 {
    if unsafe { GetCurrentThreadId() } == MAIN_THREAD.load(Ordering::Relaxed) { pump_messages(); }
    ABORT.load(Ordering::Relaxed) as u8
}

static LAST_PROGRESS: Mutex<i64> = Mutex::new(-1);
unsafe extern "system" fn progress_proc(done: i32, total: i32) {
    if total <= 0 { return; }
    let percent = (done as i64 * 100 / total as i64).clamp(0, 100);
    if let Ok(mut last) = LAST_PROGRESS.lock() {
        if *last == percent { return; }
        *last = percent;
    }
    crate::write_response(&crate::Response::Progress { done, total });
    unsafe { abort_proc(); }
}

/// Draw a plug-in's preview into its dialog. 8-bit RGB and gray only.
unsafe extern "system" fn display_pixels(map: *const PsPixelMap, src: *const VRect, dst_row: i32, dst_col: i32, ctx: *mut c_void) -> OsErr {
    if map.is_null() || src.is_null() { return FILTER_BAD_PARAMETERS; }
    unsafe {
        let m = &*map;
        let (mode, row_bytes, col_bytes, plane_bytes, base, bounds) = (m.imageMode, m.rowBytes as isize, m.colBytes as isize, m.planeBytes as isize, m.baseAddr, m.bounds);
        let r = std::ptr::read_unaligned(src);
        let (w, h) = (r.right - r.left, r.bottom - r.top);
        if w <= 0 || h <= 0 { return NO_ERR; }
        if base.is_null() || ctx.is_null() { return FILTER_BAD_PARAMETERS; }
        if mode != MODE_RGB as i32 && mode != MODE_GRAY as i32 { return FILTER_BAD_MODE; }
        let mut bgra = vec![0u8; w as usize * h as usize * 4];
        for y in 0..h as isize {
            let row = base.offset((y + (r.top - bounds.top) as isize) * row_bytes + (r.left - bounds.left) as isize * col_bytes);
            for x in 0..w as isize {
                let px = row.offset(x * col_bytes);
                let (rr, gg, bb) = if mode == MODE_RGB as i32 {
                    (*px, *px.offset(plane_bytes), *px.offset(plane_bytes * 2))
                } else { (*px, *px, *px) };
                let o = (y as usize * w as usize + x as usize) * 4;
                bgra[o] = bb; bgra[o + 1] = gg; bgra[o + 2] = rr; bgra[o + 3] = 255;
            }
        }
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = w;
        info.bmiHeader.biHeight = -h; // top-down
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        SetDIBitsToDevice(ctx as HDC, dst_col, dst_row, w as u32, h as u32, 0, 0, 0, h as u32, bgra.as_ptr() as *const c_void, &info, DIB_RGB_COLORS);
    }
    NO_ERR
}

// ── The image and advanceState ───────────────────────────────────────────────

struct Run {
    rec: *mut FilterRecord,
    big: *mut BigDocument,
    /// Always RGBA, 4 bytes per pixel; `planes` is how many of those the plug-in sees.
    image: Vec<u8>,
    width: i32,
    height: i32,
    planes: i32,
    in_buf: Vec<u8>,
    out_buf: Vec<u8>,
    out_rect: VRect,
    out_lo: i32,
    out_hi: i32,
}
static CURRENT: AtomicPtr<Run> = AtomicPtr::new(std::ptr::null_mut());
fn current() -> Option<&'static mut Run> { unsafe { CURRENT.load(Ordering::Acquire).as_mut() } }

fn v(r: Rect16) -> VRect { VRect { top: r.top as i32, left: r.left as i32, bottom: r.bottom as i32, right: r.right as i32 } }
fn empty(r: VRect) -> bool { r.left >= r.right || r.top >= r.bottom }

impl Run {
    fn rects(&self) -> (VRect, VRect) {
        unsafe {
            if (*self.big).PluginUsing32BitCoordinates != 0 {
                ((*self.big).inRect32, (*self.big).outRect32)
            } else {
                ((*self.rec).inRect.into_v(), (*self.rec).outRect.into_v())
            }
        }
    }

    /// Read a rectangle of planes lo..=hi into an interleaved buffer. Areas outside the
    /// image follow `padding`: edge replication, or a constant if it is 0..=255.
    fn read_region(&self, r: VRect, lo: i32, hi: i32, padding: i16) -> Result<Vec<u8>, OsErr> {
        let n = (hi - lo + 1) as usize;
        let size = (r.right - r.left) as usize * (r.bottom - r.top) as usize;
        let total = size.checked_mul(n).ok_or(MEM_FULL)?;
        if total > (1usize << 34) { return Err(MEM_FULL); }
        if lo < 0 || hi >= self.planes { return Err(FILTER_BAD_PARAMETERS); }
        let out_of_bounds = r.left < 0 || r.top < 0 || r.right > self.width || r.bottom > self.height;
        if out_of_bounds && padding == PADDING_ERROR { return Err(FILTER_BAD_PARAMETERS); }
        let mut buf = vec![0u8; total];
        let (w, h) = (self.width, self.height);
        let mut o = 0;
        for y in r.top..r.bottom {
            for x in r.left..r.right {
                let inside = x >= 0 && y >= 0 && x < w && y < h;
                if !inside && padding >= 0 {
                    buf[o..o + n].fill(padding as u8);
                } else {
                    let i = (y.clamp(0, h - 1) as usize * w as usize + x.clamp(0, w - 1) as usize) * 4;
                    buf[o..o + n].copy_from_slice(&self.image[i + lo as usize..=i + hi as usize]);
                }
                o += n;
            }
        }
        Ok(buf)
    }

    /// Store what the plug-in left in the output buffer, then serve its next request.
    fn advance(&mut self) -> OsErr {
        self.write_back();
        let (in_r, out_r) = self.rects();
        unsafe {
            let rec = self.rec;
            let (in_lo, in_hi) = ((*rec).inLoPlane as i32, (*rec).inHiPlane as i32);
            if empty(in_r) || in_hi < in_lo {
                self.in_buf = Vec::new();
                (*rec).inData = std::ptr::null_mut();
                (*rec).inRowBytes = 0;
            } else {
                match self.read_region(in_r, in_lo, in_hi, (*rec).inputPadding) {
                    Ok(b) => self.in_buf = b,
                    Err(e) => return e,
                }
                let n = in_hi - in_lo + 1;
                (*rec).inData = self.in_buf.as_mut_ptr();
                (*rec).inRowBytes = (in_r.right - in_r.left) * n;
                (*rec).inColumnBytes = n;
                (*rec).inPlaneBytes = 1;
            }
            let (out_lo, out_hi) = ((*rec).outLoPlane as i32, (*rec).outHiPlane as i32);
            if empty(out_r) || out_hi < out_lo {
                self.out_buf = Vec::new();
                self.out_rect = VRect::default();
                (*rec).outData = std::ptr::null_mut();
                (*rec).outRowBytes = 0;
            } else {
                // Starts as the current image, as in Photoshop, so untouched pixels survive.
                match self.read_region(out_r, out_lo, out_hi, (*rec).outputPadding) {
                    Ok(b) => self.out_buf = b,
                    Err(e) => return e,
                }
                let n = out_hi - out_lo + 1;
                self.out_rect = out_r;
                self.out_lo = out_lo;
                self.out_hi = out_hi;
                (*rec).outData = self.out_buf.as_mut_ptr();
                (*rec).outRowBytes = (out_r.right - out_r.left) * n;
                (*rec).outColumnBytes = n;
                (*rec).outPlaneBytes = 1;
            }
        }
        NO_ERR
    }

    fn write_back(&mut self) {
        let r = self.out_rect;
        if empty(r) || self.out_buf.is_empty() { return; }
        let n = (self.out_hi - self.out_lo + 1) as usize;
        let row = (r.right - r.left) as usize * n;
        for y in r.top.max(0)..r.bottom.min(self.height) {
            let src_y = (y - r.top) as usize;
            for x in r.left.max(0)..r.right.min(self.width) {
                let s = src_y * row + (x - r.left) as usize * n;
                let d = (y as usize * self.width as usize + x as usize) * 4 + self.out_lo as usize;
                self.image[d..d + n].copy_from_slice(&self.out_buf[s..s + n]);
            }
        }
    }
}

trait IntoV { fn into_v(self) -> VRect; }
impl IntoV for Rect16 { fn into_v(self) -> VRect { v(self) } }

unsafe extern "system" fn advance_state() -> OsErr {
    match current() {
        Some(run) => run.advance(),
        None => FILTER_BAD_PARAMETERS,
    }
}

// ── Loading and running ──────────────────────────────────────────────────────

pub struct Plugin { module: HMODULE, entry: PluginEntry }

pub fn load(path: &str, entry: Option<&str>) -> Result<Plugin, String> {
    use crate::pipl;
    let p = std::path::Path::new(path);
    if !p.is_file() { return Err(format!("Plug-in file not found: {path}")); }
    let entry_name = match entry {
        Some(e) => e.to_string(),
        None => pipl::read_pipls(p)?
            .into_iter()
            .find(|x| x.kind == Some(u32::from_be_bytes(*b"8BFM")) && x.entry_x64.is_some())
            .and_then(|x| x.entry_x64)
            .ok_or("This plug-in has no 64-bit filter entry point")?,
    };
    unsafe {
        // Plug-ins often sit beside their own DLLs. Adobe's built-ins import PLUGIN.dll
        // from the application folder above them, so prefer a folder that has it.
        let dir = p.ancestors().skip(1).find(|d| d.join("PLUGIN.dll").is_file())
            .or_else(|| p.parent())
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_default();
        SetDllDirectoryW(pipl::wide(&dir).as_ptr());
        let module = LoadLibraryExW(pipl::wide(path).as_ptr(), std::ptr::null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH);
        if module.is_null() {
            let code = GetLastError();
            return Err(match code {
                126 => format!("Windows could not load the plug-in or one of the DLLs it needs (error 126). It may depend on its parent application: {path}"),
                193 => format!("Not a 64-bit Windows DLL (error 193): {path}"),
                _ => format!("Windows could not load the plug-in (error {code}): {path}"),
            });
        }
        let cname = std::ffi::CString::new(entry_name.clone()).map_err(|_| "Bad entry point name")?;
        let Some(sym) = GetProcAddress(module, cname.as_ptr() as *const u8) else {
            return Err(format!("Entry point '{entry_name}' is not exported"));
        };
        Ok(Plugin { module, entry: std::mem::transmute::<_, PluginEntry>(sym) })
    }
}

impl Plugin {
    unsafe fn call(&self, selector: i16, block: *mut c_void, data: *mut isize, phase: &'static str) -> i16 {
        if let Ok(mut p) = PHASE.lock() { *p = phase; }
        let mut result: i16 = 0;
        unsafe { (self.entry)(selector, block, data, &mut result) };
        if let Ok(mut p) = PHASE.lock() { *p = "host"; }
        pump_messages();
        result
    }
}

impl Drop for Plugin {
    fn drop(&mut self) { unsafe { FreeLibrary(self.module); } }
}

/// A hidden top-level window: dialogs get a real owner even with no visible host UI.
fn owner_window() -> HWND {
    let class = crate::pipl::wide("STATIC");
    let title = crate::pipl::wide("Plajah");
    unsafe {
        CreateWindowExW(0, class.as_ptr(), title.as_ptr(), WS_OVERLAPPEDWINDOW, 0, 0, 0, 0,
            std::ptr::null_mut(), std::ptr::null_mut(), GetModuleHandleW(std::ptr::null()), std::ptr::null())
    }
}

pub fn about(plugin: &Plugin) -> Result<(), String> {
    let mut platform = PlatformData { hwnd: owner_window() as isize };
    let mut record: AboutRecord = unsafe { std::mem::zeroed() };
    record.platformData = &mut platform as *mut _ as *mut c_void;
    record.sSPBasic = &SP_BASIC;
    let mut data: isize = 0;
    let result = unsafe { plugin.call(SEL_ABOUT, &mut record as *mut _ as *mut c_void, &mut data, "about") };
    if result != 0 { return Err(describe(result, "")); }
    Ok(())
}

pub enum RunEnd {
    Done { image: Vec<u8>, parameters: Vec<u8> },
    Cancelled,
}

pub struct RunOptions {
    pub width: i32,
    pub height: i32,
    pub parameters: Option<Vec<u8>>,
    pub show_ui: bool,
    pub filter_cases: Vec<u8>,
}

fn can_filter(cases: &[u8], case: i16) -> bool {
    if cases.is_empty() { return case == CASE_FLAT; }
    cases.get((case as usize - 1) * 4).is_some_and(|&handling| handling != 0)
}

/// Choose how the plug-in sees alpha. `None` when the plug-in accepts none of the cases.
/// Returns the filter case and the plane count it should see; any plane it does not
/// see keeps its original alpha.
fn choose_case(opaque: bool, cases: &[u8]) -> Option<(i16, i32)> {
    let order: &[i16] = if opaque {
        &[CASE_FLAT, CASE_EDITABLE_TRANSPARENCY, CASE_PROTECTED_TRANSPARENCY]
    } else {
        &[CASE_EDITABLE_TRANSPARENCY, CASE_PROTECTED_TRANSPARENCY, CASE_FLAT]
    };
    order.iter().copied().find(|&c| can_filter(cases, c)).map(|c| (c, if c == CASE_EDITABLE_TRANSPARENCY { 4 } else { 3 }))
}

fn clamp16(v: i32) -> i16 { v.min(i16::MAX as i32) as i16 }

pub fn describe(code: i16, plugin_message: &str) -> String {
    if !plugin_message.is_empty() { return plugin_message.to_string(); }
    match code {
        FILTER_BAD_PARAMETERS => "The filter rejected its parameters (filterBadParameters).".into(),
        FILTER_BAD_MODE => "The filter does not support this image mode (filterBadMode).".into(),
        ERR_HOST_INSUFFICIENT => "The filter needs a Photoshop host feature Plajah does not provide (errPlugInHostInsufficient).".into(),
        MEM_FULL => "The filter ran out of memory.".into(),
        c if c > 0 => format!("The filter reported an error in its own dialog (code {c})."),
        c => format!("The filter failed with error {c}."),
    }
}

pub fn run(plugin: &Plugin, image: Vec<u8>, opt: RunOptions) -> Result<RunEnd, String> {
    let (w, h) = (opt.width, opt.height);
    let opaque = image.chunks_exact(4).all(|p| p[3] == 255);
    let (case, planes) = choose_case(opaque, &opt.filter_cases)
        .ok_or("This filter does not accept RGB images with these transparency settings")?;

    let mut platform = PlatformData { hwnd: owner_window() as isize };
    let mut error_string = [0u8; 256];
    let mut big: BigDocument = unsafe { std::mem::zeroed() };
    let full = VRect { top: 0, left: 0, bottom: h, right: w };
    big.imageSize32 = VPoint { v: h, h: w };
    big.filterRect32 = full;
    big.wholeSize32 = VPoint { v: h, h: w };

    let mut descriptor = PiDescriptorParameters {
        version: 0,
        playInfo: if opt.show_ui { PLAY_DISPLAY } else { PLAY_SILENT },
        recordInfo: 0,
        descriptor: 0,
        writeDescriptorProcs: &WRITE_DESCRIPTOR_PROCS,
        readDescriptorProcs: &READ_DESCRIPTOR_PROCS,
    };

    let mut boxed: Box<FilterRecord> = unsafe { Box::new(std::mem::zeroed()) };
    let rec: *mut FilterRecord = &mut *boxed;
    let (sw, sh) = (clamp16(w), clamp16(h));
    let rect16 = Rect16 { top: 0, left: 0, bottom: sh, right: sw };
    let size = Point16 { v: sh, h: sw };
    unsafe {
        let r = &mut *rec;
        r.abortProc = abort_proc as *const () as usize;
        r.progressProc = progress_proc as *const () as usize;
        r.imageSize = size;
        r.wholeSize = size;
        r.planes = planes as i16;
        r.filterRect = rect16;
        r.background = RgbColor { r: 0xffff, g: 0xffff, b: 0xffff };
        r.foreground = RgbColor { r: 0, g: 0, b: 0 };
        r.backColor = [255, 255, 255, 0];
        r.foreColor = [0, 0, 0, 0];
        r.maxSpace = 1 << 30;
        r.maxSpace64 = 8 << 30;
        r.autoMask = 1;
        r.hostSig = u32::from_be_bytes(*b"8BIM");
        r.hostProc = host_proc as *const () as usize;
        r.imageMode = MODE_RGB;
        r.imageHRes = 72 << 16;
        r.imageVRes = 72 << 16;
        r.monitor = PlugInMonitor {
            gamma: (22 << 16) / 10, redX: 0xA3D7, redY: 0x547B, greenX: 0x4CCD, greenY: 0x9999,
            blueX: 0x2666, blueY: 0x0F5C, whiteX: 0x5013, whiteY: 0x5439, ambient: 1 << 16,
        };
        r.platformData = &mut platform as *mut _ as *mut c_void;
        r.bufferProcs = &BUFFER_PROCS;
        r.resourceProcs = &RESOURCE_PROCS;
        r.processEvent = process_event as *const () as usize;
        r.displayPixels = display_pixels as *const () as usize;
        r.handleProcs = &HANDLE_PROCS;
        r.filterCase = case;
        r.dummyPlaneValue = -1;
        r.advanceState = advance_state as *const () as usize;
        r.supportsPadding = 1;
        r.inputPadding = PADDING_NONE;
        r.outputPadding = PADDING_NONE;
        r.maskPadding = PADDING_NONE;
        r.inputRate = 1 << 16;
        r.maskRate = 1 << 16;
        r.colorServices = color_services as *const () as usize;
        if case == CASE_FLAT {
            r.inNonLayerPlanes = planes as i16;
            r.outNonLayerPlanes = planes as i16;
            r.absNonLayerPlanes = planes as i16;
        } else {
            r.inLayerPlanes = 3;
            r.outLayerPlanes = 3;
            r.absLayerPlanes = 3;
            let t = (planes == 4) as i16;
            r.inTransparencyMask = t;
            r.outTransparencyMask = t;
            r.absTransparencyMask = t;
        }
        r.inTileHeight = sh; r.inTileWidth = sw;
        r.absTileHeight = sh; r.absTileWidth = sw;
        r.outTileHeight = sh; r.outTileWidth = sw;
        r.maskTileHeight = sh; r.maskTileWidth = sw;
        r.propertyProcs = &PROPERTY_PROCS;
        r.descriptorParameters = &mut descriptor as *mut _ as usize;
        r.errorString = error_string.as_mut_ptr();
        r.channelPortProcs = &CHANNEL_PORT_PROCS;
        r.sSPBasic = &SP_BASIC;
        r.depth = 8;
        r.bigDocumentData = &mut big;
        if let Some(bytes) = &opt.parameters {
            let handle = handle_new(bytes.len() as i32);
            if handle.is_null() { return Err("Out of memory".into()); }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), *handle, bytes.len());
            r.parameters = handle;
        }
    }

    let mut run = Box::new(Run {
        rec, big: &mut big, image, width: w, height: h, planes,
        in_buf: Vec::new(), out_buf: Vec::new(), out_rect: VRect::default(), out_lo: 0, out_hi: -1,
    });
    CURRENT.store(&mut *run, Ordering::Release);

    let mut data: isize = 0;
    let block = rec as *mut c_void;
    let message = |buf: &[u8; 256]| -> String {
        let n = buf[0] as usize;
        String::from_utf8_lossy(&buf[1..=n]).to_string()
    };
    let fail = |code: i16, buf: &[u8; 256]| -> Result<RunEnd, String> {
        if code == USER_CANCELED { return Ok(RunEnd::Cancelled); }
        Err(describe(code, &message(buf)))
    };

    unsafe {
        // Photoshop asks for parameters when it has none saved, or when the user asks.
        if opt.show_ui || opt.parameters.is_none() {
            let result = plugin.call(SEL_PARAMETERS, block, &mut data, "parameters");
            if result != 0 { return fail(result, &error_string); }
        }
        let result = plugin.call(SEL_PREPARE, block, &mut data, "prepare");
        if result != 0 { return fail(result, &error_string); }

        let result = plugin.call(SEL_START, block, &mut data, "start");
        if result != 0 { return fail(result, &error_string); }
        loop {
            if ABORT.load(Ordering::Relaxed) { return Ok(RunEnd::Cancelled); }
            let code = run.advance();
            if code != 0 { return fail(code, &error_string); }
            let (i, o) = run.rects();
            if empty(i) && empty(o) { break; }
            let result = plugin.call(SEL_CONTINUE, block, &mut data, "continue");
            if result != 0 { return fail(result, &error_string); }
        }
        let result = plugin.call(SEL_FINISH, block, &mut data, "finish");
        if result != 0 { return fail(result, &error_string); }
    }

    let parameters = unsafe { handle_bytes((*rec).parameters) };
    CURRENT.store(std::ptr::null_mut(), Ordering::Release);
    Ok(RunEnd::Done { image: std::mem::take(&mut run.image), parameters })
}
