//! OpenType shaping (rustybuzz) with font fallback, tracking and synthesized variants.
//!
//! Output glyphs are kept in LOGICAL order (an RTL run's glyph vector is reversed after
//! shaping) with clusters as absolute UTF-16 offsets. Logical order is what line breaking and
//! slicing need; the line builder reverses RTL slices back into visual order.

use crate::fonts::{FontStore, Instance};
use crate::io::char_at;
use rustybuzz::ttf_parser::Tag;
use rustybuzz::{Direction, Feature, Language, Script, UnicodeBuffer};
use std::str::FromStr;

pub const G_UNSAFE: u32 = 1;
pub const G_NOTDEF: u32 = 2;
pub const G_HYPHEN: u32 = 4;
pub const G_OBJECT: u32 = 8;
pub const G_SPACE: u32 = 16;
pub const G_LEADER: u32 = 32;
pub const G_TAB: u32 = 64;
pub const G_SYNTH: u32 = 128;

#[derive(Clone, Copy, Debug)]
pub struct Glyph {
    pub gid: u16,
    pub font: u32,
    pub size: f32,
    pub cluster: u32,
    pub x_adv: f32,
    pub y_adv: f32,
    pub x_off: f32,
    pub y_off: f32,
    /// Baseline shift in px, positive up (super/subscript, user baseline shift).
    pub shift: f32,
    pub flags: u32,
}

// Run flags (CharAttrs resolved by the host).
pub const R_SMALLCAPS: u32 = 1;
pub const R_ALLSMALLCAPS: u32 = 2;
pub const R_UPPER: u32 = 4;
pub const R_LOWER: u32 = 8;
pub const R_SUPER: u32 = 16;
pub const R_SUB: u32 = 32;
pub const R_NOBREAK: u32 = 64;
pub const R_NOHYPH: u32 = 128;
pub const R_OBJECT: u32 = 256;

#[derive(Clone, Debug)]
pub struct RunStyle {
    pub start: usize,
    pub end: usize,
    pub fonts: Vec<u32>,
    pub size: f32,
    pub tracking: f32,
    pub shift: f32,
    pub flags: u32,
    pub lang: Option<Language>,
    pub hyph: Option<u32>,
    pub features: Vec<(Tag, u32)>,
    pub obj: (f32, f32, f32),
}

impl RunStyle {
    pub fn simple(start: usize, end: usize, font: u32, size: f32) -> Self {
        Self { start, end, fonts: vec![font], size, tracking: 0.0, shift: 0.0, flags: 0, lang: None, hyph: None, features: Vec::new(), obj: (0.0, 0.0, 0.0) }
    }
    pub fn lang_from(tag: &str) -> Option<Language> {
        if tag.is_empty() { None } else { Language::from_str(tag).ok() }
    }
}

pub fn is_space(u: u16) -> bool {
    matches!(u, 0x20 | 0x3000 | 0x2000..=0x2006 | 0x2008..=0x200A | 0x205F | 0x1680)
}

fn same_width_upper(c: char) -> char {
    let mut up = c.to_uppercase();
    match (up.next(), up.next()) {
        (Some(u), None) if u.len_utf16() == c.len_utf16() => u,
        _ => c,
    }
}
fn same_width_lower(c: char) -> char {
    let mut lo = c.to_lowercase();
    match (lo.next(), lo.next()) {
        (Some(l), None) if l.len_utf16() == c.len_utf16() => l,
        _ => c,
    }
}

struct Pass<'a> {
    text: &'a [u16],
    dir: Direction,
    script: Script,
    style: &'a RunStyle,
    size: f32,
    map: fn(char) -> char,
    extra: &'a [(Tag, u32)],
    shift: f32,
    flags: u32,
}

fn shape_once(inst_id: u32, inst: &Instance, p: &Pass, start: usize, end: usize) -> Vec<Glyph> {
    let mut buf = UnicodeBuffer::new();
    // Context lets Arabic joining and contextual alternates see across run boundaries.
    let pre_from = start.saturating_sub(8);
    if pre_from < start {
        let s: String = String::from_utf16_lossy(&p.text[pre_from..start]).chars().map(p.map).collect();
        buf.set_pre_context(&s);
    }
    let mut i = start;
    while i < end {
        let (c, w) = char_at(p.text, i);
        let c = if c == '\t' { ' ' } else { (p.map)(c) };
        buf.add(c, i as u32);
        i += w;
    }
    let post_to = (end + 8).min(p.text.len());
    if end < post_to {
        let s: String = String::from_utf16_lossy(&p.text[end..post_to]).chars().map(p.map).collect();
        buf.set_post_context(&s);
    }
    buf.set_direction(p.dir);
    buf.set_script(p.script);
    if let Some(l) = &p.style.lang {
        buf.set_language(l.clone());
    }
    let mut feats: Vec<Feature> = Vec::with_capacity(p.style.features.len() + p.extra.len());
    for &(t, v) in p.style.features.iter().chain(p.extra.iter()) {
        feats.push(Feature::new(t, v, ..));
    }
    let key = format!("{:?}|{:?}|{:?}|{:?}", p.dir, p.script, p.style.lang, feats.iter().map(|f| (f.tag.0, f.value)).collect::<Vec<_>>());
    let plan = {
        let mut plans = inst.plans.borrow_mut();
        if plans.len() > 256 {
            plans.clear();
        }
        plans
            .entry(key)
            .or_insert_with(|| std::rc::Rc::new(rustybuzz::ShapePlan::new(&inst.face, p.dir, Some(p.script), p.style.lang.as_ref(), &feats)))
            .clone()
    };
    let gb = rustybuzz::shape_with_plan(&inst.face, &plan, buf);
    let scale = p.size / inst.upem;
    let mut out: Vec<Glyph> = gb
        .glyph_infos()
        .iter()
        .zip(gb.glyph_positions())
        .map(|(gi, gp)| {
            let mut flags = p.flags;
            if gi.unsafe_to_break() {
                flags |= G_UNSAFE;
            }
            if gi.glyph_id == 0 {
                flags |= G_NOTDEF;
            }
            let cu = gi.cluster as usize;
            if cu < p.text.len() && (is_space(p.text[cu]) || p.text[cu] == 0x09) {
                flags |= if p.text[cu] == 0x09 { G_TAB } else { G_SPACE };
            }
            Glyph {
                gid: gi.glyph_id as u16,
                font: inst_id,
                size: p.size,
                cluster: gi.cluster,
                x_adv: gp.x_advance as f32 * scale,
                y_adv: gp.y_advance as f32 * scale,
                x_off: gp.x_offset as f32 * scale,
                y_off: gp.y_offset as f32 * scale,
                shift: p.shift,
                flags,
            }
        })
        .collect();
    if p.dir == Direction::RightToLeft {
        out.reverse();
    }
    // A tab or an unmapped control must not render as .notdef.
    for g in out.iter_mut() {
        if g.flags & G_TAB != 0 {
            g.flags &= !G_NOTDEF;
        }
    }
    out
}

/// End offset of the cluster that starts at glyph `i` (logical order).
pub fn cluster_end(gs: &[Glyph], i: usize, end: usize) -> usize {
    let c = gs[i].cluster;
    gs[i..].iter().find(|g| g.cluster > c).map(|g| g.cluster as usize).unwrap_or(end)
}

fn shape_chain(store: &FontStore, chain: &[u32], p: &Pass, start: usize, end: usize) -> Vec<Glyph> {
    let Some((&first, rest)) = chain.split_first() else { return Vec::new() };
    let Some(inst) = store.inst(first) else {
        return shape_chain(store, rest, p, start, end);
    };
    let gs = shape_once(first, inst, p, start, end);
    if rest.is_empty() || !gs.iter().any(|g| g.flags & G_NOTDEF != 0) {
        return gs;
    }
    // Split into maximal cluster spans that are entirely notdef / entirely covered.
    let mut out = Vec::with_capacity(gs.len());
    let mut i = 0;
    while i < gs.len() {
        let c0 = gs[i].cluster;
        let mut j = i;
        while j < gs.len() && gs[j].cluster == c0 {
            j += 1;
        }
        let missing = gs[i..j].iter().any(|g| g.flags & G_NOTDEF != 0);
        if !missing {
            out.extend_from_slice(&gs[i..j]);
            i = j;
            continue;
        }
        // Extend over following missing clusters.
        let mut k = j;
        while k < gs.len() {
            let ck = gs[k].cluster;
            let mut m = k;
            while m < gs.len() && gs[m].cluster == ck {
                m += 1;
            }
            if gs[k..m].iter().any(|g| g.flags & G_NOTDEF != 0) {
                k = m;
            } else {
                break;
            }
        }
        let s = c0 as usize;
        let e = if k < gs.len() { gs[k].cluster as usize } else { end };
        out.extend(shape_chain(store, rest, p, s, e));
        i = k;
    }
    out
}

/// Shape `[start, end)` of `text` with `style` at a fixed direction/script, applying fallback,
/// synthesized small caps / super / subscript, case transforms and tracking.
pub fn shape_run(store: &FontStore, text: &[u16], start: usize, end: usize, style: &RunStyle, rtl: bool, script: [u8; 4]) -> Vec<Glyph> {
    if start >= end {
        return Vec::new();
    }
    if style.flags & R_OBJECT != 0 {
        return (start..end)
            .map(|i| Glyph { gid: 0, font: style.fonts.first().copied().unwrap_or(0), size: style.size, cluster: i as u32, x_adv: if i == start { style.obj.0 } else { 0.0 }, y_adv: 0.0, x_off: 0.0, y_off: 0.0, shift: style.shift, flags: G_OBJECT })
            .collect();
    }
    let dir = if rtl { Direction::RightToLeft } else { Direction::LeftToRight };
    let script_tag = Script::from_iso15924_tag(Tag::from_bytes(&script)).unwrap_or(rustybuzz::script::LATIN);
    let primary = style.fonts.first().and_then(|&f| store.inst(f));
    let mut size = style.size;
    let mut shift = style.shift;
    let mut extra: Vec<(Tag, u32)> = Vec::new();
    let mut map: fn(char) -> char = |c| c;
    if style.flags & R_UPPER != 0 {
        map = same_width_upper;
        extra.push((Tag::from_bytes(b"case"), 1));
    } else if style.flags & R_LOWER != 0 {
        map = same_width_lower;
    }
    if style.flags & (R_SUPER | R_SUB) != 0 {
        // Synthesized: 65% size, raised a third of the em / lowered 15% (InDesign's defaults are
        // 58.3% / 33.3% / 33.3%; these read better with modern x-heights).
        size *= 0.65;
        shift += if style.flags & R_SUPER != 0 { style.size * 0.34 } else { -style.size * 0.14 };
    }
    let wants_sc = style.flags & (R_SMALLCAPS | R_ALLSMALLCAPS) != 0;
    let native_sc = wants_sc && primary.is_some_and(|i| i.has_gsub(b"smcp"));
    if native_sc {
        extra.push((Tag::from_bytes(b"smcp"), 1));
        if style.flags & R_ALLSMALLCAPS != 0 {
            extra.push((Tag::from_bytes(b"c2sc"), 1));
        }
    }
    let base = Pass { text, dir, script: script_tag, style, size, map, extra: &extra, shift, flags: 0 };
    let mut glyphs = if wants_sc && !native_sc {
        // Synthesized small caps: lowercase letters (or every letter for all-small-caps) are set
        // as capitals at the x-height/cap-height ratio with a touch of extra tracking, the way a
        // compositor fakes them when the cut has no smcp.
        let ratio = primary.map(|i| (i.metrics.x_height / i.metrics.cap_height * 1.07).clamp(0.66, 0.82)).unwrap_or(0.75);
        let all = style.flags & R_ALLSMALLCAPS != 0;
        let mut out = Vec::new();
        let mut i = start;
        while i < end {
            let (c, _) = char_at(text, i);
            let small = if all { c.is_alphabetic() } else { c.is_lowercase() };
            let mut j = i;
            while j < end {
                let (cj, wj) = char_at(text, j);
                let sj = if all { cj.is_alphabetic() } else { cj.is_lowercase() };
                if sj != small {
                    break;
                }
                j += wj;
            }
            if small {
                let p = Pass { size: size * ratio, map: same_width_upper, flags: G_SYNTH, ..base };
                let mut gs = shape_chain(store, &style.fonts, &p, i, j);
                let track = style.size * 0.03;
                add_tracking(&mut gs, track, j);
                out.extend(gs);
            } else {
                out.extend(shape_chain(store, &style.fonts, &base, i, j));
            }
            i = j;
        }
        out
    } else {
        shape_chain(store, &style.fonts, &base, start, end)
    };
    if style.tracking != 0.0 && !crate::itemize::is_cursive(&script) {
        add_tracking(&mut glyphs, style.tracking, end);
    }
    glyphs
}

/// Adds `px` after every cluster (to the logically-last glyph of the cluster).
pub fn add_tracking(gs: &mut [Glyph], px: f32, _end: usize) {
    let n = gs.len();
    for i in 0..n {
        let last_of_cluster = i + 1 == n || gs[i + 1].cluster != gs[i].cluster;
        if last_of_cluster && gs[i].flags & (G_TAB | G_OBJECT) == 0 {
            gs[i].x_adv += px;
        }
    }
}
