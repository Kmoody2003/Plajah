//! plajah-text — the platform text engine.
//!
//! Compiled to `wasm32-unknown-unknown` as a bare `cdylib` (no wasm-bindgen), like
//! plajah-audio. The host:
//!   1. `pt_create()` → engine pointer;
//!   2. writes a request into the engine's input words (`pt_input(p, words)` returns where);
//!   3. calls an operation, which returns a status (`>= 0` ok, `< 0` error);
//!   4. reads the reply from `pt_output_ptr(p)` / `pt_output_len(p)` (32-bit words).
//!
//! Font bytes travel through a byte staging area (`pt_bytes(p, n)` then `pt_font_load`).
//! Every binary layout is documented on the function that reads or writes it, and mirrored in
//! `services/text/engine/wasm.ts`. All text offsets are UTF-16 code units.
//!
//! This file is the ABI only — logic lives in the modules.

pub mod fonts;
pub mod hyph;
pub mod io;
pub mod itemize;
pub mod kp;
pub mod para;
pub mod protrude;
pub mod shape;

use fonts::FontStore;
use hyph::Hyphenator;
use io::{Reader, Writer};
use rustybuzz::ttf_parser::Tag;
use shape::RunStyle;
use std::collections::HashMap;

/// Bump on any ABI change so the host refuses a stale committed `.wasm`.
/// v1: fonts/instances/info/outlines, shaping, UAX#14 breaks, Liang hyphenation, paragraph
/// layout (total-fit, OMA, tabs, bidi, caret spans).
pub const ABI_VERSION: u32 = 1;

#[derive(Default)]
pub struct Engine {
    pub fonts: FontStore,
    pub hyphs: HashMap<u32, Hyphenator>,
    input: Vec<u32>,
    bytes: Vec<u8>,
    pub out: Writer,
}

#[unsafe(no_mangle)]
pub extern "C" fn pt_abi_version() -> u32 {
    ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pt_create() -> *mut Engine {
    Box::into_raw(Box::default())
}

/// # Safety
/// `p` must come from `pt_create` and must not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_destroy(p: *mut Engine) {
    if !p.is_null() {
        drop(unsafe { Box::from_raw(p) });
    }
}

macro_rules! eng {
    ($p:expr, $ret:expr) => {
        match unsafe { $p.as_mut() } {
            Some(e) => e,
            None => return $ret,
        }
    };
}

/// Pointer to an input area of `words` u32 words (valid until the next call that may grow memory).
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_input(p: *mut Engine, words: u32) -> *mut u32 {
    let e = eng!(p, core::ptr::null_mut());
    e.input.clear();
    e.input.resize(words as usize, 0);
    e.input.as_mut_ptr()
}

/// Byte staging area for font files.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_bytes(p: *mut Engine, n: u32) -> *mut u8 {
    let e = eng!(p, core::ptr::null_mut());
    e.bytes.clear();
    e.bytes.resize(n as usize, 0);
    e.bytes.as_mut_ptr()
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_output_ptr(p: *mut Engine) -> *const u32 {
    let e = eng!(p, core::ptr::null());
    e.out.w.as_ptr()
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_output_len(p: *mut Engine) -> u32 {
    let e = eng!(p, 0);
    e.out.w.len() as u32
}

// ── Fonts ───────────────────────────────────────────────────────────────────────────────────

/// Registers the staged bytes as a font file. Returns blob id or -1.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_font_load(p: *mut Engine) -> i32 {
    let e = eng!(p, -2);
    let bytes = std::mem::take(&mut e.bytes);
    e.fonts.load_blob(bytes)
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_font_unload(p: *mut Engine, blob: u32) {
    let e = eng!(p, ());
    e.fonts.unload_blob(blob);
}

/// Output: faceCount, family, subfamily, postscriptName (len-prefixed UTF-16),
/// 12×f32 metrics [upem, asc, desc, lineGap, capH, xH, ulPos, ulThick, stPos, stThick, italicAngle, glyphCount],
/// os2Weight, os2Width, flags (1 italic, 2 mono, 4 variable),
/// axisCount × [tag, min f32, def f32, max f32, hidden, name],
/// instanceCount × [name, coordCount, coords f32…],
/// gsubCount × tag, gposCount × tag.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_font_info(p: *mut Engine, blob: u32, index: u32) -> i32 {
    let e = eng!(p, -2);
    e.out.clear();
    if fonts::write_info(&e.fonts, blob, index, &mut e.out) { 0 } else { -1 }
}

/// Input: axisCount, axisCount × [tag u32, value f32]. Returns instance id or -1.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_instance_create(p: *mut Engine, blob: u32, index: u32) -> i32 {
    let e = eng!(p, -2);
    let mut r = Reader::new(&e.input);
    let n = r.u32() as usize;
    let coords: Vec<(Tag, f32)> = (0..n.min(64)).map(|_| (Tag(r.u32()), r.f32())).collect();
    e.fonts.create_instance(blob, index, &coords)
}

/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_instance_destroy(p: *mut Engine, inst: u32) {
    let e = eng!(p, ());
    e.fonts.destroy_instance(inst);
}

/// Output: 12×f32 metrics (as `pt_font_info`), gsubCount × tag, gposCount × tag.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_instance_metrics(p: *mut Engine, inst: u32) -> i32 {
    let e = eng!(p, -2);
    e.out.clear();
    let Some(i) = e.fonts.inst(inst) else { return -1 };
    let m = i.metrics;
    for v in [m.upem, m.ascender, m.descender, m.line_gap, m.cap_height, m.x_height, m.underline_pos, m.underline_thickness, m.strike_pos, m.strike_thickness, m.italic_angle, m.glyph_count] {
        e.out.f32(v);
    }
    e.out.u32(i.gsub_features.len() as u32);
    for t in &i.gsub_features {
        e.out.u32(t.0);
    }
    e.out.u32(i.gpos_features.len() as u32);
    for t in &i.gpos_features {
        e.out.u32(t.0);
    }
    0
}

/// Glyph id for a code point (0 = missing).
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_glyph_index(p: *mut Engine, inst: u32, cp: u32) -> u32 {
    let e = eng!(p, 0);
    let Some(i) = e.fonts.inst(inst) else { return 0 };
    char::from_u32(cp).and_then(|c| i.glyph(c)).unwrap_or(0) as u32
}

/// Input: count, count × gid. Output: count × [gid, opCount, xMin, yMin, xMax, yMax, advance,
/// ops…] where each op is `0 x y` (move), `1 x y` (line), `2 x1 y1 x y` (quad),
/// `3 x1 y1 x2 y2 x y` (cubic) or `4` (close). Font units, y up, at the instance's axes.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_outlines(p: *mut Engine, inst: u32) -> i32 {
    let e = eng!(p, -2);
    e.out.clear();
    let Some(i) = e.fonts.inst(inst) else { return -1 };
    let mut r = Reader::new(&e.input);
    let n = r.u32() as usize;
    e.out.u32(n as u32);
    for _ in 0..n {
        let gid = r.u32() as u16;
        fonts::write_outline(i, gid, &mut e.out);
    }
    0
}

// ── Runs (shared by shape and layout) ───────────────────────────────────────────────────────

/// Run layout: start, end, size f32, tracking f32 (px), shift f32 (px, up), flags,
/// fontCount, fonts…, hyphLang (u32::MAX = none), lang (len-prefixed UTF-16 BCP 47),
/// featureCount × [tag, value], objW f32, objAscent f32, objDescent f32.
fn read_run(r: &mut Reader) -> RunStyle {
    let start = r.u32() as usize;
    let end = r.u32() as usize;
    let size = r.f32();
    let tracking = r.f32();
    let shift = r.f32();
    let flags = r.u32();
    let nf = (r.u32() as usize).min(32);
    let fonts: Vec<u32> = (0..nf).map(|_| r.u32()).collect();
    let hy = r.u32();
    let lang = r.string();
    let nfeat = (r.u32() as usize).min(64);
    let features: Vec<(Tag, u32)> = (0..nfeat).map(|_| (Tag(r.u32()), r.u32())).collect();
    let obj = (r.f32(), r.f32(), r.f32());
    RunStyle { start, end, fonts, size, tracking, shift, flags, lang: RunStyle::lang_from(&lang), hyph: if hy == u32::MAX { None } else { Some(hy) }, features, obj }
}

/// Input: textLen, text (UTF-16), run, direction (0 auto, 1 LTR, 2 RTL), script tag (0 = auto).
/// Output: count × [gid, cluster, font, xAdv f32, yAdv f32, xOff f32, yOff f32, flags] in
/// VISUAL order (px at the run size).
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_shape(p: *mut Engine) -> i32 {
    let e = eng!(p, -2);
    let input = std::mem::take(&mut e.input);
    let mut r = Reader::new(&input);
    let n = r.u32() as usize;
    let text = r.utf16(n);
    let mut run = read_run(&mut r);
    run.start = 0;
    run.end = n;
    let dir = r.u32();
    let script = r.u32();
    let (levels, para) = itemize::bidi_levels(&text, dir);
    let rtl = if dir == 0 { levels.first().copied().unwrap_or(para) % 2 == 1 } else { dir == 2 };
    let sc = if script == 0 { itemize::scripts(&text).first().copied().unwrap_or(*b"Latn") } else { script.to_be_bytes() };
    let mut gs = shape::shape_run(&e.fonts, &text, 0, n, &run, rtl, sc);
    if rtl {
        gs.reverse();
    }
    e.out.clear();
    e.out.u32(gs.len() as u32);
    for g in gs {
        e.out.u32(g.gid as u32);
        e.out.u32(g.cluster);
        e.out.u32(g.font);
        e.out.f32(g.x_adv);
        e.out.f32(g.y_adv);
        e.out.f32(g.x_off);
        e.out.f32(g.y_off + g.shift);
        e.out.u32(g.flags);
    }
    e.input = input;
    0
}

/// Input: textLen, text. Output: count × [offset, kind (1 allowed, 2 mandatory)] — UAX #14
/// opportunities *before* each offset.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_breaks(p: *mut Engine) -> i32 {
    let e = eng!(p, -2);
    let mut r = Reader::new(&e.input);
    let n = r.u32() as usize;
    let text = r.utf16(n);
    let b = itemize::break_opportunities(&text);
    e.out.clear();
    let at = e.out.slot();
    let mut c = 0;
    for (i, k) in b.iter().enumerate() {
        let v = match k {
            itemize::Brk::None => continue,
            itemize::Brk::Allowed => 1,
            itemize::Brk::Mandatory => 2,
        };
        e.out.u32(i as u32);
        e.out.u32(v);
        c += 1;
    }
    e.out.patch(at, c);
    0
}

// ── Hyphenation ─────────────────────────────────────────────────────────────────────────────

/// Input: patterns (len-prefixed UTF-16), exceptions (len-prefixed UTF-16). Returns the number
/// of patterns loaded under `lang` (a host-assigned id).
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_hyph_load(p: *mut Engine, lang: u32, left: u32, right: u32) -> i32 {
    let e = eng!(p, -2);
    let mut r = Reader::new(&e.input);
    let pat = r.string();
    let exc = r.string();
    let h = Hyphenator::load(&pat, &exc, left as usize, right as usize);
    let c = h.pattern_count() as i32;
    e.hyphs.insert(lang, h);
    c
}

/// Input: word (len-prefixed UTF-16). Output: count × UTF-16 offset of each break point.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_hyphenate(p: *mut Engine, lang: u32, left: u32, right: u32) -> i32 {
    let e = eng!(p, -2);
    let mut r = Reader::new(&e.input);
    let w = r.string();
    e.out.clear();
    let Some(h) = e.hyphs.get(&lang) else { return -1 };
    let chars: Vec<char> = w.chars().collect();
    let pts = h.hyphenate(&chars, left as usize, right as usize);
    e.out.u32(pts.len() as u32);
    for pt in pts {
        let off: usize = chars[..pt].iter().map(|c| c.len_utf16()).sum();
        e.out.u32(off as u32);
    }
    0
}

// ── Paragraph layout ────────────────────────────────────────────────────────────────────────

fn read_params(r: &mut Reader) -> para::ParaParams {
    let mut p = para::ParaParams { align: r.u32(), base_dir: r.u32(), ..Default::default() };
    p.word = [r.f32(), r.f32(), r.f32()];
    p.letter = [r.f32(), r.f32(), r.f32()];
    p.glyph = [r.f32(), r.f32(), r.f32()];
    p.kp.pretolerance = r.f32();
    p.kp.tolerance = r.f32();
    p.kp.line_penalty = r.f32();
    p.kp.double_hyphen_demerits = r.f32();
    p.kp.final_hyphen_demerits = r.f32();
    p.kp.adj_demerits = r.f32();
    p.kp.looseness = r.i32();
    p.kp.emergency_stretch = r.f32();
    p.kp.max_hyphens = r.u32();
    p.kp.rag = r.f32();
    p.kp.last_min = r.f32();
    p.kp.hyph_zone = r.f32();
    p.hyphen_penalty = r.f32();
    p.explicit_hyphen_penalty = r.f32();
    p.hyph_min_word = r.u32();
    p.hyph_before = r.u32();
    p.hyph_after = r.u32();
    p.hyph_caps = r.bool();
    p.oma = r.f32();
    p.algorithm = r.u32();
    p.single_word = r.u32();
    p.default_tab = r.f32();
    let nt = (r.u32() as usize).min(256);
    p.tabs = (0..nt).map(|_| para::TabStop { pos: r.f32(), kind: r.u32(), leader: r.u32(), align_char: r.u32() }).collect();
    let nw = (r.u32() as usize).min(1 << 20);
    p.widths = (0..nw).map(|_| r.f32()).collect();
    if p.widths.is_empty() {
        p.widths.push(1e9);
    }
    p
}

pub fn write_layout(out: &mut Writer, l: &para::ParaLayout) {
    out.clear();
    out.u32(l.lines.len() as u32);
    out.u32(l.para_level as u32);
    out.u32(l.algo);
    out.f32(l.demerits as f32);
    out.f32(l.badness as f32);
    out.u32(l.missing.len() as u32);
    for (s, e) in &l.missing {
        out.u32(*s);
        out.u32(*e);
    }
    for ln in &l.lines {
        out.u32(ln.start);
        out.u32(ln.end);
        out.u32(ln.content_end);
        out.u32(ln.flags);
        for v in [ln.x, ln.width, ln.natural, ln.ascent, ln.descent, ln.line_gap, ln.max_size, ln.ratio, ln.glyph_scale, ln.word_extra, ln.letter_extra] {
            out.f32(v);
        }
        out.u32(ln.runs.len() as u32);
        for r in &ln.runs {
            out.u32(r.font);
            out.f32(r.size);
            out.u32(r.level as u32);
            out.u32(r.style);
            out.f32(r.x);
            out.f32(r.width);
            out.f32(r.shift);
            out.f32(r.scale_x);
            out.u32(r.flags);
            out.u32(r.glyphs.len() as u32);
            for g in &r.glyphs {
                out.u32(g.gid as u32);
                out.u32(g.cluster);
                out.f32(g.x);
                out.f32(g.y);
                out.f32(g.adv);
                out.u32(g.flags);
            }
        }
        out.u32(ln.spans.len() as u32);
        for s in &ln.spans {
            out.u32(s.start);
            out.u32(s.end);
            out.f32(s.x0);
            out.f32(s.x1);
            out.u32(s.rtl as u32);
        }
    }
}

/// Input: textLen, text, runCount, runs…, params (see `read_params`: align, baseDir,
/// word[3], letter[3], glyph[3], pretolerance, tolerance, linePenalty, doubleHyphenDemerits,
/// finalHyphenDemerits, adjDemerits, looseness i32, emergencyStretch, maxHyphens, rag, lastMin, hyphZone,
/// hyphenPenalty, explicitHyphenPenalty, hyphMinWord, hyphBefore, hyphAfter, hyphCaps, oma,
/// algorithm, singleWord, defaultTab, tabCount × [pos, kind, leader, alignChar],
/// widthCount × width).
///
/// Output: lineCount, paraLevel, algo, demerits f32, badness f32, missingCount × [start, end],
/// then per line: start, end, contentEnd, flags, x, width, natural, ascent, descent, lineGap,
/// maxSize, ratio, glyphScale, wordExtra, letterExtra (f32s), runCount × [font, size, level,
/// style, x, width, shift, scaleX, flags, glyphCount × [gid, cluster, x, y, adv, flags]],
/// spanCount × [start, end, x0, x1, rtl]. Runs are in visual order; x is relative to the line's
/// measure origin; glyph x is relative to its run; y offsets are up-positive.
/// # Safety
/// `p` must be a live engine pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pt_layout(p: *mut Engine) -> i32 {
    let e = eng!(p, -2);
    let input = std::mem::take(&mut e.input);
    let mut r = Reader::new(&input);
    let n = r.u32() as usize;
    let text = r.utf16(n);
    let nr = (r.u32() as usize).min(1 << 16);
    let runs: Vec<RunStyle> = (0..nr).map(|_| read_run(&mut r)).collect();
    let params = read_params(&mut r);
    let lay = para::layout(&e.fonts, &e.hyphs, &text, &runs, &params);
    write_layout(&mut e.out, &lay);
    e.input = input;
    0
}
