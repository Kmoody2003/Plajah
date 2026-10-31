//! Read PiPL resources without running any plug-in code: the DLL is mapped as a data
//! file, so a hostile or broken plug-in cannot execute during a scan.
use serde::Serialize;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows_sys::Win32::Foundation::{FreeLibrary, GetLastError, HMODULE};
use windows_sys::Win32::System::LibraryLoader::{
    EnumResourceNamesW, FindResourceW, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE,
    LoadLibraryExW, LoadResource, LockResource, SizeofResource,
};

const fn cc(s: &[u8; 4]) -> u32 { u32::from_be_bytes(*s) }
const KEY_KIND: u32 = cc(b"kind");
const KEY_NAME: u32 = cc(b"name");
const KEY_CATEGORY: u32 = cc(b"catg");
const KEY_X64: u32 = cc(b"8664");
const KEY_FILTER_CASES: u32 = cc(b"fici");
const KIND_FILTER: u32 = cc(b"8BFM");

#[derive(Debug, Serialize, Clone)]
pub struct PluginInfo {
    pub name: String,
    pub category: String,
    pub entry: String,
    pub kind: &'static str,
    pub path: String,
    /// Seven filter cases × (inputHandling, outputHandling, flags1, flags2); empty if absent.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub filter_cases: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Skipped {
    pub path: String,
    pub reason: String,
}

pub fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

fn pascal(data: &[u8]) -> String {
    let Some(&len) = data.first() else { return String::new() };
    let end = (1 + len as usize).min(data.len());
    // PiPL strings are single-byte; lossy keeps a scan from failing on odd encodings.
    String::from_utf8_lossy(&data[1..end]).trim_end_matches('\0').to_string()
}

fn c_string(data: &[u8]) -> String {
    let end = data.iter().position(|&b| b == 0).unwrap_or(data.len());
    String::from_utf8_lossy(&data[..end]).to_string()
}

#[derive(Debug, Default, PartialEq)]
pub struct Pipl {
    pub kind: Option<u32>,
    pub name: String,
    pub category: String,
    pub entry_x64: Option<String>,
    pub filter_cases: Vec<u8>,
}

/// Layout: i16 resource version, i32 PiPL version, i32 count, then properties of
/// (vendor u32, key u32, id i32, length i32, data padded to 4 bytes).
pub fn parse_pipl(bytes: &[u8]) -> Result<Pipl, String> {
    let read_u32 = |at: usize| -> Option<u32> {
        bytes.get(at..at + 4).map(|b| u32::from_le_bytes(b.try_into().unwrap()))
    };
    let count = read_u32(6).ok_or("PiPL is too short")? as usize;
    let mut at = 10usize;
    let mut out = Pipl::default();
    for _ in 0..count {
        let (Some(_vendor), Some(key), Some(_id), Some(len)) =
            (read_u32(at), read_u32(at + 4), read_u32(at + 8), read_u32(at + 12))
        else {
            return Err("PiPL property header runs past the resource".into());
        };
        let len = len as usize;
        let start = at + 16;
        let data = bytes.get(start..start.saturating_add(len)).ok_or("PiPL property runs past the resource")?;
        match key {
            KEY_KIND if len >= 4 => out.kind = read_u32(start),
            KEY_NAME => out.name = pascal(data),
            KEY_CATEGORY => out.category = pascal(data),
            KEY_X64 => out.entry_x64 = Some(c_string(data)),
            KEY_FILTER_CASES => out.filter_cases = data.to_vec(),
            _ => {}
        }
        at = start + ((len + 3) & !3);
    }
    Ok(out)
}

unsafe extern "system" fn collect_name(_: HMODULE, _: *const u16, name: *const u16, param: isize) -> i32 {
    unsafe { (*(param as *mut Vec<usize>)).push(name as usize) };
    1
}

/// Adobe's current built-ins carry their PiPLs as a "JSON" resource instead of binary.
/// One resource can describe several filters, each with its own entry point.
pub fn parse_json_pipls(bytes: &[u8]) -> Vec<Pipl> {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim_matches(|c: char| c == '\0' || c == '\u{feff}' || c.is_whitespace());
    let Ok(root) = serde_json::from_str::<serde_json::Value>(text) else { return Vec::new() };
    let Some(list) = root.get("PiPLs").and_then(|v| v.as_array()) else { return Vec::new() };
    let text_of = |item: &serde_json::Value, key: &str| item.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string();
    list.iter().map(|item| {
        let kind = text_of(item, "Kind");
        let kind = if kind == "Filter" {
            KIND_FILTER
        } else {
            let mut four = *b"    ";
            for (slot, b) in four.iter_mut().zip(kind.bytes()) { *slot = b; }
            u32::from_be_bytes(four)
        };
        let entry = text_of(item, "CodeEntryPointWin64");
        // Rebuilt in the binary 'fici' shape; only "can this case run" is read from it.
        let filter_cases = item.get("FilterCaseInfo").and_then(|v| v.as_array()).map(|cases| {
            cases.iter().flat_map(|case| {
                let handling = |key: &str| {
                    let name = case.get(key).and_then(|v| v.as_str()).unwrap_or("");
                    (!name.contains("CantFilter")) as u8
                };
                [handling("InputHandling"), handling("OutputHandling"), 0, 0]
            }).collect::<Vec<u8>>()
        }).unwrap_or_default();
        Pipl {
            kind: Some(kind),
            name: text_of(item, "Name"),
            category: text_of(item, "Category"),
            entry_x64: if entry.is_empty() { None } else { Some(entry) },
            filter_cases,
        }
    }).collect()
}

/// All PiPL resources in one file.
pub fn read_pipls(path: &Path) -> Result<Vec<Pipl>, String> {
    let wpath = wide(&path.to_string_lossy());
    let module = unsafe {
        LoadLibraryExW(wpath.as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE)
    };
    if module.is_null() {
        return Err(format!("not a readable PE file (Windows error {})", unsafe { GetLastError() }));
    }
    let rtype = wide("PIPL");
    let mut names: Vec<usize> = Vec::new();
    unsafe {
        EnumResourceNamesW(module, rtype.as_ptr(), Some(collect_name), &mut names as *mut _ as isize);
    }
    let mut out = Vec::new();
    let mut error = None;
    let json_type = wide("JSON");
    let mut json_names: Vec<usize> = Vec::new();
    unsafe {
        EnumResourceNamesW(module, json_type.as_ptr(), Some(collect_name), &mut json_names as *mut _ as isize);
        for name in json_names {
            let info = FindResourceW(module, name as *const u16, json_type.as_ptr());
            if info.is_null() { continue; }
            let size = SizeofResource(module, info) as usize;
            let ptr: *const c_void = LockResource(LoadResource(module, info));
            if ptr.is_null() { continue; }
            out.extend(parse_json_pipls(std::slice::from_raw_parts(ptr as *const u8, size)));
        }
    }
    for name in names {
        unsafe {
            let info = FindResourceW(module, name as *const u16, rtype.as_ptr());
            if info.is_null() { continue; }
            let size = SizeofResource(module, info) as usize;
            let loaded = LoadResource(module, info);
            let ptr: *const c_void = LockResource(loaded);
            if ptr.is_null() { continue; }
            match parse_pipl(std::slice::from_raw_parts(ptr as *const u8, size)) {
                Ok(pipl) => out.push(pipl),
                Err(e) => error = Some(e),
            }
        }
    }
    unsafe { FreeLibrary(module) };
    if out.is_empty() {
        return Err(error.unwrap_or_else(|| "no PiPL resource".into()));
    }
    Ok(out)
}

fn walk(dir: &Path, depth: u32, files: &mut Vec<PathBuf>) {
    if depth > 16 { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        if kind.is_symlink() { continue; }
        if kind.is_dir() {
            walk(&path, depth + 1, files);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("8bf")) {
            files.push(path);
        }
    }
}

pub fn scan(directories: &[String]) -> (Vec<PluginInfo>, Vec<Skipped>) {
    let mut files = Vec::new();
    for dir in directories { walk(Path::new(dir), 0, &mut files); }
    files.sort();
    files.dedup();
    let (mut plugins, mut skipped) = (Vec::new(), Vec::new());
    for file in files {
        let path = file.to_string_lossy().to_string();
        let pipls = match read_pipls(&file) {
            Ok(p) => p,
            Err(reason) => { skipped.push(Skipped { path, reason }); continue; }
        };
        let mut accepted = 0;
        let mut reason = String::from("no filter entries");
        for p in pipls {
            if p.kind != Some(KIND_FILTER) {
                let k = p.kind.map(|k| String::from_utf8_lossy(&k.to_be_bytes()).to_string()).unwrap_or_else(|| "none".into());
                reason = format!("not a filter (kind {k})");
                continue;
            }
            let Some(entry) = p.entry_x64 else {
                reason = "no 64-bit entry point".into();
                continue;
            };
            let name = if p.name.is_empty() {
                file.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
            } else { p.name };
            plugins.push(PluginInfo { name, category: p.category, entry, kind: "filter", path: path.clone(), filter_cases: p.filter_cases });
            accepted += 1;
        }
        if accepted == 0 { skipped.push(Skipped { path, reason }); }
    }
    (plugins, skipped)
}
