//! Crash-isolated Photoshop filter host. Line-delimited JSON over stdin/stdout; the
//! caller runs one process per plug-in so a crash takes out only this sidecar.
//!
//! Requests:  {"type":"scan","directories":[...]}
//!            {"type":"run","path":..,"entry":?,"input":..,"width":..,"height":..,
//!             "output":..,"parameters":?(base64),"show_ui":bool}
//!            {"type":"about","path":..,"entry":?}
//!            {"type":"abort"}    honoured while a run is in progress
//! Responses: ready, plugins, progress, result, cancelled, ok, error, crash
#![windows_subsystem = "windows"]

mod host;
mod pipl;
mod sdk;

use serde::{Deserialize, Serialize};
use std::io::{self, BufRead};
use std::sync::OnceLock;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{RecvTimeoutError, channel};
use std::time::Duration;
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Storage::FileSystem::*;
use windows_sys::Win32::System::Console::*;
use windows_sys::Win32::System::Diagnostics::Debug::*;
use windows_sys::Win32::System::LibraryLoader::{
    GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, GetModuleFileNameW, GetModuleHandleExW,
};
use windows_sys::Win32::System::Threading::*;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Scan { directories: Vec<String> },
    Run {
        path: String,
        entry: Option<String>,
        input: String,
        width: i32,
        height: i32,
        output: String,
        parameters: Option<String>,
        #[serde(default)]
        show_ui: bool,
    },
    About { path: String, entry: Option<String> },
    Abort,
}

#[derive(Debug, Serialize, Default)]
pub struct Diagnostics {
    denied_suites: Vec<String>,
    denied_procs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Response {
    Ready,
    Plugins { plugins: Vec<pipl::PluginInfo>, skipped: Vec<pipl::Skipped> },
    Progress { done: i32, total: i32 },
    Result { output: String, width: i32, height: i32, parameters: String, diagnostics: Diagnostics },
    Cancelled,
    Ok,
    Error { message: String, diagnostics: Diagnostics },
}

fn diagnostics() -> Diagnostics {
    Diagnostics {
        denied_suites: host::DENIED_SUITES.lock().map(|g| g.clone()).unwrap_or_default(),
        denied_procs: host::DENIED_PROCS.lock().map(|g| g.clone()).unwrap_or_default(),
    }
}

// ── Output ───────────────────────────────────────────────────────────────────
// The real stdout handle is kept private and the process-wide one is pointed at NUL,
// so a plug-in that prints cannot corrupt the protocol.

static STDOUT: OnceLock<usize> = OnceLock::new();

fn write_raw(bytes: &[u8]) {
    let Some(&handle) = STDOUT.get() else { return };
    let mut written = 0u32;
    unsafe { WriteFile(handle as HANDLE, bytes.as_ptr(), bytes.len() as u32, &mut written, std::ptr::null_mut()); }
}

pub fn write_response(response: &Response) {
    if let Ok(mut line) = serde_json::to_vec(response) {
        line.push(b'\n');
        write_raw(&line);
    }
}

fn claim_stdout() {
    unsafe {
        STDOUT.get_or_init(|| GetStdHandle(STD_OUTPUT_HANDLE) as usize);
        let nul = pipl::wide("NUL");
        let sink = CreateFileW(nul.as_ptr(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, std::ptr::null(), OPEN_EXISTING, 0, std::ptr::null_mut());
        if sink != INVALID_HANDLE_VALUE { SetStdHandle(STD_OUTPUT_HANDLE, sink); }
    }
}

// ── Crash reporting ──────────────────────────────────────────────────────────

/// Exit code the caller sees when a plug-in crashed the process.
const EXIT_CRASH: u32 = 3;

unsafe extern "system" fn on_crash(info: *const EXCEPTION_POINTERS) -> i32 {
    unsafe {
        let code = (*(*info).ExceptionRecord).ExceptionCode as u32;
        let address = (*(*info).ExceptionRecord).ExceptionAddress as usize;
        // A crash can land while a lock is held: never block on it here.
        let phase = host::PHASE.try_lock().map(|p| *p).unwrap_or("unknown");
        // Built by hand so the handler does as little as possible on a damaged process.
        let record = &*(*info).ExceptionRecord;
        let fault = if code == 0xC000_0005 && record.NumberParameters >= 2 {
            format!("{}0x{:X}", if record.ExceptionInformation[0] == 1 { "write " } else { "read " }, record.ExceptionInformation[1])
        } else { String::new() };
        let mut module: HMODULE = std::ptr::null_mut();
        let mut name = [0u16; 260];
        let mut len = 0;
        if GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, address as *const u16, &mut module) != 0 {
            len = GetModuleFileNameW(module, name.as_mut_ptr(), 260) as usize;
        }
        let module_path = String::from_utf16_lossy(&name[..len]);
        let module_name = module_path.rsplit('\\').next().unwrap_or("").replace('"', "");
        let offset = address.wrapping_sub(module as usize);
        let suites = host::DENIED_SUITES.try_lock().map(|l| l.join(", ")).unwrap_or_default().replace('"', "");
        let procs = host::DENIED_PROCS.try_lock().map(|l| l.join(", ")).unwrap_or_default().replace('"', "");
        let line = format!("{{\"type\":\"crash\",\"code\":\"0x{code:08X}\",\"phase\":\"{phase}\",\"module\":\"{module_name}\",\"offset\":\"0x{offset:X}\",\"fault\":\"{fault}\",\"denied_suites\":\"{suites}\",\"denied_procs\":\"{procs}\"}}\n");
        write_raw(line.as_bytes());
        TerminateProcess(GetCurrentProcess(), EXIT_CRASH);
    }
    1
}

// ── Requests ─────────────────────────────────────────────────────────────────

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn b64_decode(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let (mut bits, mut acc) = (0u32, 0u32);
    for b in text.bytes().filter(|b| !b.is_ascii_whitespace() && *b != b'=') {
        let value = B64.iter().position(|c| *c == b).ok_or("parameters are not valid base64")? as u32;
        acc = acc << 6 | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
fn run_request(path: String, entry: Option<String>, input: String, width: i32, height: i32, output: String, parameters: Option<String>, show_ui: bool) -> Result<Response, String> {
    if width <= 0 || height <= 0 { return Err("Image width and height must be positive".into()); }
    let image = std::fs::read(&input).map_err(|e| format!("Could not read input image: {e}"))?;
    if image.len() as u64 != width as u64 * height as u64 * 4 {
        return Err(format!("Input is {} bytes; {width}x{height} RGBA needs {}", image.len(), width as u64 * height as u64 * 4));
    }
    let parameters = parameters.as_deref().filter(|p| !p.is_empty()).map(b64_decode).transpose()?;
    let filter_cases = pipl::read_pipls(std::path::Path::new(&path)).ok()
        .and_then(|list| list.into_iter().find(|p| entry.is_none() || p.entry_x64 == entry))
        .map(|p| p.filter_cases)
        .unwrap_or_default();
    let plugin = host::load(&path, entry.as_deref())?;
    match host::run(&plugin, image, host::RunOptions { width, height, parameters, show_ui, filter_cases })? {
        host::RunEnd::Cancelled => Ok(Response::Cancelled),
        host::RunEnd::Done { image, parameters } => {
            let temp = format!("{output}.tmp");
            std::fs::write(&temp, &image).map_err(|e| format!("Could not write output image: {e}"))?;
            std::fs::rename(&temp, &output).map_err(|e| format!("Could not write output image: {e}"))?;
            Ok(Response::Result { output, width, height, parameters: b64_encode(&parameters), diagnostics: diagnostics() })
        }
    }
}

fn main() {
    unsafe {
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
        SetUnhandledExceptionFilter(Some(on_crash));
        let mut guarantee = 128 * 1024u32;
        SetThreadStackGuarantee(&mut guarantee); // room to report a stack overflow
        host::MAIN_THREAD.store(GetCurrentThreadId(), Ordering::Relaxed);
    }
    claim_stdout();
    write_response(&Response::Ready);

    // stdin is read on its own thread: the main thread belongs to the plug-in and its
    // dialogs, and an abort has to get through while a filter is running.
    let (sender, requests) = channel::<Result<Request, String>>();
    std::thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() { continue; }
            match serde_json::from_str::<Request>(&line) {
                Ok(Request::Abort) => host::ABORT.store(true, Ordering::Relaxed),
                Ok(request) => { if sender.send(Ok(request)).is_err() { break; } }
                Err(error) => { if sender.send(Err(error.to_string())).is_err() { break; } }
            }
        }
        host::ABORT.store(true, Ordering::Relaxed); // caller went away
    });

    loop {
        host::pump_messages();
        let request = match requests.recv_timeout(Duration::from_millis(50)) {
            Ok(request) => request,
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break,
        };
        let result = match request {
            Err(message) => Err(message),
            Ok(Request::Scan { directories }) => {
                let (plugins, skipped) = pipl::scan(&directories);
                Ok(Response::Plugins { plugins, skipped })
            }
            Ok(Request::About { path, entry }) => {
                host::load(&path, entry.as_deref()).and_then(|plugin| host::about(&plugin)).map(|_| Response::Ok)
            }
            Ok(Request::Run { path, entry, input, width, height, output, parameters, show_ui }) => {
                // ABORT is not reset here: one process serves one run, and an abort that
                // arrives before the filter starts must still count.
                run_request(path, entry, input, width, height, output, parameters, show_ui)
            }
            Ok(Request::Abort) => Ok(Response::Ok),
        };
        match result {
            Ok(response) => write_response(&response),
            Err(message) => write_response(&Response::Error { message, diagnostics: diagnostics() }),
        }
    }
}
