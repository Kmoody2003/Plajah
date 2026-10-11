//! Font registry: raw font files ("blobs") and positioned faces ("instances").
//!
//! A blob is the bytes of one file (TTF/OTF or a TTC/OTC collection). An instance is one face of
//! a blob at fixed variation coordinates — `Inter[opsz,wght]` at wght=650 is a different
//! instance from the same file at wght=400, because advances, outlines and even GSUB feature
//! variations change with the axes. Shaping, metrics and outlines always address an instance.
//!
//! Blob bytes are leaked into `'static` so a `rustybuzz::Face` can borrow them without a
//! self-referential struct; `unload_blob` reclaims them after dropping every dependent instance.

use rustybuzz::ttf_parser::{self, GlyphId, OutlineBuilder, Tag};
use rustybuzz::{Face, Variation};

pub struct Blob {
    data: &'static [u8],
    raw: *mut [u8],
    pub faces: u32,
}

pub struct Instance {
    pub blob: u32,
    pub index: u32,
    pub face: Face<'static>,
    pub upem: f32,
    pub coords: Vec<(Tag, f32)>,
    pub gsub_features: Vec<Tag>,
    pub gpos_features: Vec<Tag>,
    pub metrics: Metrics,
    /// Compiled shape plans keyed by (direction, script, language, features). Building a plan
    /// (feature collection + lookup compilation) costs more than shaping a word, so a paragraph
    /// would otherwise spend most of its time re-planning the same run settings.
    pub plans: std::cell::RefCell<std::collections::HashMap<String, std::rc::Rc<rustybuzz::ShapePlan>>>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Metrics {
    pub upem: f32,
    pub ascender: f32,
    pub descender: f32,
    pub line_gap: f32,
    pub cap_height: f32,
    pub x_height: f32,
    pub underline_pos: f32,
    pub underline_thickness: f32,
    pub strike_pos: f32,
    pub strike_thickness: f32,
    pub italic_angle: f32,
    pub glyph_count: f32,
}

#[derive(Default)]
pub struct FontStore {
    blobs: Vec<Option<Blob>>,
    insts: Vec<Option<Instance>>,
}

impl Drop for FontStore {
    fn drop(&mut self) {
        self.insts.clear();
        for b in self.blobs.drain(..).flatten() {
            drop(unsafe { Box::from_raw(b.raw) });
        }
    }
}

pub fn tag_from_u32(v: u32) -> Tag {
    Tag(v)
}

fn layout_features(t: Option<ttf_parser::opentype_layout::LayoutTable>) -> Vec<Tag> {
    let mut out = Vec::new();
    if let Some(t) = t {
        for f in t.features {
            if !out.contains(&f.tag) {
                out.push(f.tag);
            }
        }
    }
    out
}

impl FontStore {
    /// Register file bytes. Returns the blob id, or -1 when the bytes are not a font.
    pub fn load_blob(&mut self, bytes: Vec<u8>) -> i32 {
        let faces = match ttf_parser::fonts_in_collection(&bytes) {
            Some(n) => n,
            None => {
                if ttf_parser::Face::parse(&bytes, 0).is_err() {
                    return -1;
                }
                1
            }
        };
        if faces == 0 {
            return -1;
        }
        let raw: *mut [u8] = Box::into_raw(bytes.into_boxed_slice());
        let data: &'static [u8] = unsafe { &*raw };
        let blob = Blob { data, raw, faces };
        if let Some(slot) = self.blobs.iter().position(|b| b.is_none()) {
            self.blobs[slot] = Some(blob);
            slot as i32
        } else {
            self.blobs.push(Some(blob));
            (self.blobs.len() - 1) as i32
        }
    }

    pub fn unload_blob(&mut self, id: u32) {
        for slot in self.insts.iter_mut() {
            if slot.as_ref().is_some_and(|i| i.blob == id) {
                *slot = None;
            }
        }
        if let Some(b) = self.blobs.get_mut(id as usize).and_then(|b| b.take()) {
            drop(unsafe { Box::from_raw(b.raw) });
        }
    }

    pub fn blob(&self, id: u32) -> Option<&Blob> {
        self.blobs.get(id as usize).and_then(|b| b.as_ref())
    }

    pub fn blob_face(&self, id: u32, index: u32) -> Option<ttf_parser::Face<'static>> {
        let b = self.blob(id)?;
        ttf_parser::Face::parse(b.data, index).ok()
    }

    /// One face of a blob at the given axis coordinates (unknown axes are ignored, values are
    /// clamped by the font's own `fvar` range).
    pub fn create_instance(&mut self, blob: u32, index: u32, coords: &[(Tag, f32)]) -> i32 {
        let Some(b) = self.blob(blob) else { return -1 };
        let Some(mut face) = Face::from_slice(b.data, index) else { return -1 };
        let mut applied = Vec::new();
        if face.is_variable() && !coords.is_empty() {
            let axes: Vec<_> = face.variation_axes().into_iter().collect();
            let vars: Vec<Variation> = coords
                .iter()
                .filter_map(|&(tag, v)| {
                    let ax = axes.iter().find(|a| a.tag == tag)?;
                    let v = v.clamp(ax.min_value, ax.max_value);
                    applied.push((tag, v));
                    Some(Variation { tag, value: v })
                })
                .collect();
            face.set_variations(&vars);
        }
        let upem = face.units_per_em() as f32;
        let metrics = read_metrics(&face);
        let gsub_features = layout_features(face.tables().gsub);
        let gpos_features = layout_features(face.tables().gpos);
        let inst = Instance { blob, index, face, upem, coords: applied, gsub_features, gpos_features, metrics, plans: Default::default() };
        if let Some(slot) = self.insts.iter().position(|i| i.is_none()) {
            self.insts[slot] = Some(inst);
            slot as i32
        } else {
            self.insts.push(Some(inst));
            (self.insts.len() - 1) as i32
        }
    }

    pub fn destroy_instance(&mut self, id: u32) {
        if let Some(s) = self.insts.get_mut(id as usize) {
            *s = None;
        }
    }

    #[inline]
    pub fn inst(&self, id: u32) -> Option<&Instance> {
        self.insts.get(id as usize).and_then(|i| i.as_ref())
    }
}

fn read_metrics(face: &ttf_parser::Face) -> Metrics {
    let upem = face.units_per_em() as f32;
    let ul = face.underline_metrics();
    let st = face.strikeout_metrics();
    let x_height = face.x_height().map(|v| v as f32).unwrap_or(upem * 0.5);
    let cap = face.capital_height().map(|v| v as f32).filter(|v| *v > 0.0).unwrap_or(upem * 0.7);
    Metrics {
        upem,
        ascender: face.ascender() as f32,
        descender: face.descender() as f32,
        line_gap: face.line_gap() as f32,
        cap_height: cap,
        x_height,
        underline_pos: ul.map(|m| m.position as f32).unwrap_or(-upem * 0.1),
        underline_thickness: ul.map(|m| m.thickness as f32).filter(|t| *t > 0.0).unwrap_or(upem * 0.05),
        strike_pos: st.map(|m| m.position as f32).filter(|p| *p > 0.0).unwrap_or(x_height * 0.55),
        strike_thickness: st.map(|m| m.thickness as f32).filter(|t| *t > 0.0).unwrap_or(upem * 0.05),
        italic_angle: face.italic_angle(),
        glyph_count: face.number_of_glyphs() as f32,
    }
}

impl Instance {
    pub fn has_gsub(&self, tag: &[u8; 4]) -> bool {
        let t = Tag::from_bytes(tag);
        self.gsub_features.contains(&t)
    }
    #[inline]
    pub fn glyph(&self, ch: char) -> Option<u16> {
        self.face.glyph_index(ch).map(|g| g.0)
    }
}

// ── Outlines ────────────────────────────────────────────────────────────────────────────────

/// Path command opcodes in the outline buffer. Coordinates are font units, y up.
pub const OP_MOVE: u32 = 0;
pub const OP_LINE: u32 = 1;
pub const OP_QUAD: u32 = 2;
pub const OP_CUBIC: u32 = 3;
pub const OP_CLOSE: u32 = 4;

pub struct PathSink<'a> {
    pub out: &'a mut crate::io::Writer,
    pub ops: u32,
}

impl OutlineBuilder for PathSink<'_> {
    fn move_to(&mut self, x: f32, y: f32) {
        self.out.u32(OP_MOVE);
        self.out.f32(x);
        self.out.f32(y);
        self.ops += 1;
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.out.u32(OP_LINE);
        self.out.f32(x);
        self.out.f32(y);
        self.ops += 1;
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.out.u32(OP_QUAD);
        for v in [x1, y1, x, y] {
            self.out.f32(v);
        }
        self.ops += 1;
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.out.u32(OP_CUBIC);
        for v in [x1, y1, x2, y2, x, y] {
            self.out.f32(v);
        }
        self.ops += 1;
    }
    fn close(&mut self) {
        self.out.u32(OP_CLOSE);
        self.ops += 1;
    }
}

/// Writes `[gid, opCount, xMin, yMin, xMax, yMax, advance, ...ops]` for one glyph.
pub fn write_outline(inst: &Instance, gid: u16, out: &mut crate::io::Writer) {
    out.u32(gid as u32);
    let count_at = out.slot();
    let bbox_at = out.len();
    for _ in 0..4 {
        out.f32(0.0);
    }
    out.f32(inst.face.glyph_hor_advance(GlyphId(gid)).unwrap_or(0) as f32);
    let mut sink = PathSink { out, ops: 0 };
    let bb = inst.face.outline_glyph(GlyphId(gid), &mut sink);
    let ops = sink.ops;
    out.patch(count_at, ops);
    if let Some(r) = bb {
        out.w[bbox_at] = (r.x_min as f32).to_bits();
        out.w[bbox_at + 1] = (r.y_min as f32).to_bits();
        out.w[bbox_at + 2] = (r.x_max as f32).to_bits();
        out.w[bbox_at + 3] = (r.y_max as f32).to_bits();
    }
}

/// Font file description: names, axes, named instances, features, default metrics.
pub fn write_info(store: &FontStore, blob: u32, index: u32, out: &mut crate::io::Writer) -> bool {
    let Some(b) = store.blob(blob) else { return false };
    let Ok(face) = ttf_parser::Face::parse(b.data, index) else { return false };
    out.u32(b.faces);
    let name = |ids: &[u16]| -> String {
        for &id in ids {
            for n in face.names() {
                if n.name_id == id && n.is_unicode() {
                    if let Some(s) = n.to_string() {
                        return s;
                    }
                }
            }
        }
        String::new()
    };
    out.string(&name(&[16, 1]));
    out.string(&name(&[17, 2]));
    out.string(&name(&[6]));
    let m = read_metrics(&face);
    for v in [m.upem, m.ascender, m.descender, m.line_gap, m.cap_height, m.x_height, m.underline_pos, m.underline_thickness, m.strike_pos, m.strike_thickness, m.italic_angle, m.glyph_count] {
        out.f32(v);
    }
    let os2 = face.tables().os2;
    out.u32(os2.map(|t| t.weight().to_number() as u32).unwrap_or(400));
    out.u32(os2.map(|t| t.width().to_number() as u32).unwrap_or(5));
    out.u32(face.is_italic() as u32 | ((face.is_monospaced() as u32) << 1) | ((face.is_variable() as u32) << 2));
    // Axes.
    let axes: Vec<_> = face.variation_axes().into_iter().collect();
    out.u32(axes.len() as u32);
    for a in &axes {
        out.u32(a.tag.0);
        out.f32(a.min_value);
        out.f32(a.def_value);
        out.f32(a.max_value);
        out.u32(a.hidden as u32);
        out.string(&name(&[a.name_id]));
    }
    // Named instances straight from fvar (ttf-parser exposes axes only).
    let mut named: Vec<(String, Vec<f32>)> = Vec::new();
    if let Some(fvar) = face.raw_face().table(Tag::from_bytes(b"fvar")) {
        let rd16 = |o: usize| -> Option<u16> { fvar.get(o..o + 2).map(|s| u16::from_be_bytes([s[0], s[1]])) };
        if let (Some(axes_off), Some(axis_count), Some(axis_size), Some(inst_count), Some(inst_size)) =
            (rd16(4), rd16(8), rd16(10), rd16(12), rd16(14))
        {
            let base = axes_off as usize + axis_count as usize * axis_size as usize;
            for i in 0..inst_count as usize {
                let o = base + i * inst_size as usize;
                let Some(sub) = rd16(o) else { break };
                let mut coords = Vec::with_capacity(axis_count as usize);
                for k in 0..axis_count as usize {
                    let p = o + 4 + k * 4;
                    let Some(s) = fvar.get(p..p + 4) else { break };
                    coords.push(i32::from_be_bytes([s[0], s[1], s[2], s[3]]) as f32 / 65536.0);
                }
                named.push((name(&[sub]), coords));
            }
        }
    }
    out.u32(named.len() as u32);
    for (n, coords) in &named {
        out.string(n);
        out.u32(coords.len() as u32);
        for c in coords {
            out.f32(*c);
        }
    }
    let gsub = layout_features(face.tables().gsub);
    let gpos = layout_features(face.tables().gpos);
    out.u32(gsub.len() as u32);
    for t in gsub {
        out.u32(t.0);
    }
    out.u32(gpos.len() as u32);
    for t in gpos {
        out.u32(t.0);
    }
    true
}
