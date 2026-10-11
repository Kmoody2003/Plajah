//! Paragraph composer: itemise → shape → build boxes/glue/penalties → break (total-fit) →
//! rebuild each line (reshape at unsafe cuts, insert hyphens) → justify (word, letter, glyph
//! scaling, in that priority) → optical margins → bidi reorder → positioned glyph runs and
//! caret spans.
//!
//! Every offset is a UTF-16 code unit of the paragraph text, which is what the host's model uses.

use crate::fonts::FontStore;
use crate::hyph::Hyphenator;
use crate::io::char_at;
use crate::itemize::{self, Brk};
use crate::kp::{self, Item, Kind};
use crate::protrude;
use crate::shape::{self, Glyph, RunStyle, G_HYPHEN, G_LEADER, G_OBJECT, G_SPACE, G_TAB, R_NOBREAK, R_NOHYPH, R_OBJECT};
use std::collections::HashMap;
use unicode_segmentation::UnicodeSegmentation;

pub const A_START: u32 = 0;
pub const A_END: u32 = 1;
pub const A_CENTER: u32 = 2;
pub const A_JUSTIFY: u32 = 3;
pub const A_JUSTIFY_ALL: u32 = 4;
pub const A_JUSTIFY_CENTER: u32 = 5;
pub const A_JUSTIFY_END: u32 = 6;
pub const A_LEFT: u32 = 7;
pub const A_RIGHT: u32 = 8;

#[derive(Clone, Copy, Debug)]
pub struct TabStop {
    pub pos: f32,
    /// 0 left, 1 right, 2 center, 3 decimal
    pub kind: u32,
    pub leader: u32,
    pub align_char: u32,
}

#[derive(Clone, Debug)]
pub struct ParaParams {
    pub align: u32,
    pub base_dir: u32,
    pub word: [f32; 3],
    pub letter: [f32; 3],
    pub glyph: [f32; 3],
    pub kp: kp::Params,
    pub hyphen_penalty: f32,
    pub explicit_hyphen_penalty: f32,
    pub hyph_min_word: u32,
    pub hyph_before: u32,
    pub hyph_after: u32,
    pub hyph_caps: bool,
    pub oma: f32,
    pub algorithm: u32,
    pub tabs: Vec<TabStop>,
    pub default_tab: f32,
    pub widths: Vec<f32>,
    /// Single-word justified line: 0 start, 1 full (letter-spaced), 2 center, 3 end.
    pub single_word: u32,
}

impl Default for ParaParams {
    fn default() -> Self {
        Self {
            align: A_JUSTIFY,
            base_dir: 0,
            word: [0.8, 1.0, 1.33],
            letter: [0.0, 0.0, 0.0],
            glyph: [1.0, 1.0, 1.0],
            kp: kp::Params::default(),
            hyphen_penalty: 50.0,
            explicit_hyphen_penalty: 50.0,
            hyph_min_word: 6,
            hyph_before: 2,
            hyph_after: 3,
            hyph_caps: true,
            oma: 0.0,
            algorithm: 0,
            tabs: Vec::new(),
            default_tab: 36.0,
            widths: vec![1e9],
            single_word: 0,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PGlyph {
    pub gid: u16,
    pub cluster: u32,
    pub x: f32,
    pub y: f32,
    pub adv: f32,
    pub flags: u32,
}

#[derive(Clone, Debug)]
pub struct LineRun {
    pub font: u32,
    pub size: f32,
    pub level: u8,
    pub style: u32,
    pub x: f32,
    pub width: f32,
    pub shift: f32,
    pub scale_x: f32,
    pub flags: u32,
    pub glyphs: Vec<PGlyph>,
}

#[derive(Clone, Copy, Debug)]
pub struct Span {
    pub start: u32,
    pub end: u32,
    pub x0: f32,
    pub x1: f32,
    pub rtl: bool,
}

pub const L_HYPHENATED: u32 = 1;
pub const L_FORCED: u32 = 2;
pub const L_LAST: u32 = 4;
pub const L_JUSTIFIED: u32 = 8;
pub const L_OVERFULL: u32 = 16;

#[derive(Clone, Debug, Default)]
pub struct Line {
    pub start: u32,
    pub end: u32,
    pub content_end: u32,
    pub flags: u32,
    pub x: f32,
    pub width: f32,
    pub natural: f32,
    pub ascent: f32,
    pub descent: f32,
    pub line_gap: f32,
    pub max_size: f32,
    pub ratio: f32,
    pub glyph_scale: f32,
    pub word_extra: f32,
    pub letter_extra: f32,
    pub runs: Vec<LineRun>,
    pub spans: Vec<Span>,
}

#[derive(Clone, Debug, Default)]
pub struct ParaLayout {
    pub lines: Vec<Line>,
    pub para_level: u8,
    pub missing: Vec<(u32, u32)>,
    pub demerits: f64,
    pub algo: u32,
    pub badness: f64,
}

struct Seg {
    start: usize,
    end: usize,
    level: u8,
    script: [u8; 4],
    run: usize,
    g0: usize,
    g1: usize,
}

fn is_newline(u: u16) -> bool {
    matches!(u, 0x0A | 0x0B | 0x0C | 0x0D | 0x85 | 0x2028 | 0x2029)
}

fn is_hyphen_char(u: u16) -> bool {
    matches!(u, 0x2D | 0x2010 | 0x2012 | 0x2013)
}

fn run_index(runs: &[RunStyle], n: usize) -> Vec<usize> {
    let mut out = vec![0usize; n];
    for (k, r) in runs.iter().enumerate() {
        for slot in out.iter_mut().take(r.end.min(n)).skip(r.start.min(n)) {
            *slot = k;
        }
    }
    out
}

struct Ctx<'a> {
    store: &'a FontStore,
    text: &'a [u16],
    runs: &'a [RunStyle],
    p: &'a ParaParams,
    glyphs: Vec<Glyph>,
    segs: Vec<Seg>,
    adv: Vec<f32>,
    cstart: Vec<bool>,
    run_of: Vec<usize>,
    hyphen_w: HashMap<usize, (f32, u16)>,
    cursive: Vec<bool>,
}

impl Ctx<'_> {
    fn hyphen(&mut self, run: usize) -> (f32, u16) {
        if let Some(&h) = self.hyphen_w.get(&run) {
            return h;
        }
        let r = &self.runs[run];
        let mut res = (r.size * 0.33, 0x2D);
        if let Some(inst) = r.fonts.first().and_then(|&f| self.store.inst(f)) {
            let ch = if inst.glyph('\u{2010}').is_some() { 0x2010u16 } else { 0x2Du16 };
            let tmp = [ch];
            let gs = shape::shape_run(self.store, &tmp, 0, 1, r, false, *b"Latn");
            res = (gs.iter().map(|g| g.x_adv).sum(), ch);
        }
        self.hyphen_w.insert(run, res);
        res
    }

    fn width(&self, a: usize, b: usize) -> f32 {
        self.adv[a..b].iter().sum()
    }

    fn clusters(&self, a: usize, b: usize) -> usize {
        self.cstart[a..b].iter().filter(|c| **c).count()
    }

    fn justified(&self) -> bool {
        matches!(self.p.align, A_JUSTIFY | A_JUSTIFY_ALL | A_JUSTIFY_CENTER | A_JUSTIFY_END)
    }

    /// A box for text [a, b) with letter/glyph-scaling capacity and protrusion.
    fn make_box(&self, a: usize, b: usize) -> Item {
        let mut it = Item::bx(self.width(a, b), a as u32, b as u32);
        if a >= b {
            return it;
        }
        let run = &self.runs[self.run_of[a]];
        let seg_cursive = self.cursive[a];
        if self.justified() {
            let c = self.clusters(a, b) as f32;
            if !seg_cursive {
                it.width += c * self.p.letter[1] * run.size;
                it.lstretch = c * (self.p.letter[2] - self.p.letter[1]).max(0.0) * run.size;
                it.lshrink = c * (self.p.letter[1] - self.p.letter[0]).max(0.0) * run.size;
            }
            it.gstretch = it.width * (self.p.glyph[2] - self.p.glyph[1]).max(0.0);
            it.gshrink = it.width * (self.p.glyph[1] - self.p.glyph[0]).max(0.0);
        }
        if self.p.oma > 0.0 {
            let (c0, _) = char_at(self.text, a);
            it.lp = protrude::left(c0) * self.adv[a] * self.p.oma;
            // Last cluster start in [a, b).
            let mut lc = b - 1;
            while lc > a && !self.cstart[lc] {
                lc -= 1;
            }
            let mut li = b - 1;
            if li > a && (0xDC00..0xE000).contains(&self.text[li]) {
                li -= 1;
            }
            let (cl, _) = char_at(self.text, li);
            it.rp = protrude::right(cl) * self.adv[lc] * self.p.oma;
        }
        it
    }

    /// Hyphenation points (code-unit offsets, a < pt < b) for the word in [a, b).
    fn hyph_points(&self, hyphs: &HashMap<u32, Hyphenator>, a: usize, b: usize) -> (Vec<usize>, bool) {
        // Discretionary (soft) hyphens override patterns.
        let shy: Vec<usize> = (a + 1..b).filter(|&i| self.text[i - 1] == 0xAD).collect();
        if !shy.is_empty() {
            return (shy, false);
        }
        let run = &self.runs[self.run_of[a]];
        if run.flags & (R_NOHYPH | R_NOBREAK | R_OBJECT) != 0 {
            return (Vec::new(), true);
        }
        let Some(h) = run.hyph.and_then(|id| hyphs.get(&id)) else { return (Vec::new(), true) };
        // Core word: strip leading/trailing non-letters.
        let mut chars: Vec<(char, usize)> = Vec::new();
        let mut i = a;
        while i < b {
            let (c, w) = char_at(self.text, i);
            chars.push((c, i));
            i += w;
        }
        let s = chars.iter().position(|(c, _)| c.is_alphabetic()).unwrap_or(chars.len());
        let e = chars.iter().rposition(|(c, _)| c.is_alphabetic()).map(|x| x + 1).unwrap_or(s);
        if e <= s {
            return (Vec::new(), true);
        }
        let core = &chars[s..e];
        if core.len() < self.p.hyph_min_word as usize || core.iter().any(|(c, _)| !c.is_alphabetic()) {
            return (Vec::new(), true);
        }
        if !self.p.hyph_caps && core[0].0.is_uppercase() {
            return (Vec::new(), true);
        }
        // Points must not cut a run boundary (different fonts would need different hyphens).
        let word: Vec<char> = core.iter().map(|(c, _)| *c).collect();
        let pts = h.hyphenate(&word, self.p.hyph_before as usize, self.p.hyph_after as usize);
        (pts.into_iter().map(|k| core[k].1).collect(), true)
    }
}

/// Tab width resolution shared by the breaker (via closure) and the line builder.
fn resolve_tab(p: &ParaParams, x: f32, seg: f32, dec: f32) -> (f32, Option<TabStop>) {
    let eps = 0.01;
    for t in &p.tabs {
        if t.pos > x + eps {
            let w = match t.kind {
                1 => t.pos - x - seg,
                2 => t.pos - x - seg / 2.0,
                3 => t.pos - x - dec,
                _ => t.pos - x,
            };
            if w >= 0.0 {
                return (w, Some(*t));
            }
        }
    }
    let step = if p.default_tab > 0.5 { p.default_tab } else { 36.0 };
    let next = ((x + eps) / step).floor() * step + step;
    (next - x, None)
}

pub fn layout(store: &FontStore, hyphs: &HashMap<u32, Hyphenator>, text: &[u16], runs: &[RunStyle], p: &ParaParams) -> ParaLayout {
    let n = text.len();
    let fallback_run;
    let runs: &[RunStyle] = if runs.is_empty() {
        fallback_run = [RunStyle::simple(0, n, 0, 12.0)];
        &fallback_run
    } else {
        runs
    };
    let (levels, para_level) = itemize::bidi_levels(text, p.base_dir);
    let scripts = itemize::scripts(text);
    let run_of = run_index(runs, n);

    // ── Shaping segments ──
    let mut segs: Vec<Seg> = Vec::new();
    let mut glyphs: Vec<Glyph> = Vec::new();
    let mut i = 0;
    while i < n {
        let special = text[i] == 0x09 || is_newline(text[i]);
        let mut j = i + 1;
        if !special {
            while j < n && levels[j] == levels[i] && scripts[j] == scripts[i] && run_of[j] == run_of[i] && text[j] != 0x09 && !is_newline(text[j]) {
                j += 1;
            }
        }
        let g0 = glyphs.len();
        if text[i] == 0x09 {
            let r = &runs[run_of[i]];
            glyphs.push(Glyph { gid: 0, font: r.fonts.first().copied().unwrap_or(0), size: r.size, cluster: i as u32, x_adv: 0.0, y_adv: 0.0, x_off: 0.0, y_off: 0.0, shift: 0.0, flags: G_TAB });
        } else if !special {
            glyphs.extend(shape::shape_run(store, text, i, j, &runs[run_of[i]], levels[i] % 2 == 1, scripts[i]));
        }
        segs.push(Seg { start: i, end: j, level: levels[i], script: scripts[i], run: run_of[i], g0, g1: glyphs.len() });
        i = j;
    }
    let mut adv = vec![0f32; n + 1];
    let mut cstart = vec![false; n + 1];
    let mut missing: Vec<(u32, u32)> = Vec::new();
    for s in &segs {
        let gs = &glyphs[s.g0..s.g1];
        for (k, g) in gs.iter().enumerate() {
            let c = g.cluster as usize;
            if c < n {
                adv[c] += g.x_adv;
                cstart[c] = true;
            }
            if g.flags & shape::G_NOTDEF != 0 && g.flags & G_TAB == 0 {
                let e = shape::cluster_end(gs, k, s.end) as u32;
                match missing.last_mut() {
                    Some(m) if m.1 >= g.cluster => m.1 = m.1.max(e),
                    _ => missing.push((g.cluster, e)),
                }
            }
        }
    }
    let cursive: Vec<bool> = scripts.iter().map(itemize::is_cursive).collect();
    let mut ctx = Ctx { store, text, runs, p, glyphs, segs, adv, cstart, run_of, hyphen_w: HashMap::new(), cursive };

    // ── Items ──
    let mut brk = itemize::break_opportunities(text);
    for k in 1..n {
        let r = &runs[ctx.run_of[k]];
        if ctx.run_of[k - 1] == ctx.run_of[k] && r.flags & R_NOBREAK != 0 && brk[k] == Brk::Allowed {
            brk[k] = Brk::None;
        }
    }
    let justified = ctx.justified();
    let min_width = p.widths.iter().copied().fold(f32::INFINITY, f32::min).max(1.0);
    let mut items: Vec<Item> = Vec::new();
    let mut i = 0;
    while i < n {
        let mut e = i + 1;
        while e < n && brk[e] == Brk::None {
            e += 1;
        }
        let mandatory = brk.get(e).copied() == Some(Brk::Mandatory) && e <= n && (e < n || (e > 0 && is_newline(text[e - 1])));
        let mut me = e;
        while me > i && is_newline(text[me - 1]) {
            me -= 1;
        }
        let mut ws = me;
        while ws > i && shape::is_space(text[ws - 1]) {
            ws -= 1;
        }
        // Content [i, ws), split at tabs.
        let mut a = i;
        while a < ws {
            if text[a] == 0x09 {
                let mut t = Item::bx(0.0, a as u32, a as u32 + 1);
                t.kind = Kind::Tab;
                items.push(t);
                a += 1;
                continue;
            }
            let mut b = a;
            while b < ws && text[b] != 0x09 {
                b += 1;
            }
            let (pts, auto) = ctx.hyph_points(hyphs, a, b);
            let wbox = ctx.width(a, b);
            let mut cuts: Vec<(usize, bool)> = pts.into_iter().map(|q| (q, true)).collect();
            if wbox > min_width {
                // Emergency character breaks for strings longer than any measure (URLs, codes).
                for q in a + 1..b {
                    if ctx.cstart[q] && !cuts.iter().any(|c| c.0 == q) {
                        cuts.push((q, false));
                    }
                }
                cuts.sort_by_key(|c| c.0);
            }
            let mut s = a;
            for (q, hy) in cuts {
                if q <= s || q >= b {
                    continue;
                }
                items.push(ctx.make_box(s, q));
                if hy {
                    let (hw, _) = ctx.hyphen(ctx.run_of[q - 1]);
                    let mut pen = Item::penalty(hw, p.hyphen_penalty, true, q as u32);
                    pen.auto_hyph = auto;
                    pen.rp = protrude::right('-') * hw * p.oma;
                    items.push(pen);
                } else {
                    items.push(Item::penalty(0.0, 5000.0, false, q as u32));
                }
                s = q;
            }
            items.push(ctx.make_box(s, b));
            a = b;
        }
        if ws < me {
            let w = ctx.width(ws, me);
            let (wd, st, sh) = if justified {
                (w * p.word[1], w * (p.word[2] - p.word[1]).max(0.0), w * (p.word[1] - p.word[0]).max(0.0))
            } else {
                (w * p.word[1], 0.0, w * (p.word[1] - p.word[0]).max(0.0) * 0.5)
            };
            items.push(Item::glue(wd, st, sh, ws as u32, me as u32));
        }
        if mandatory {
            let mut fill = Item::glue(0.0, 0.0, 0.0, me as u32, me as u32);
            fill.fil = p.align != A_JUSTIFY_ALL;
            items.push(fill);
            let mut pen = Item::penalty(0.0, -kp::INF, false, me as u32);
            pen.end = e as u32;
            items.push(pen);
        } else if ws == me && e < n && ws > i {
            let prev = text[ws - 1];
            let both_cjk = itemize::is_cjk(&scripts[ws - 1]) || itemize::is_cjk(&scripts[e.min(n - 1)]);
            if is_hyphen_char(prev) {
                items.push(Item::penalty(0.0, p.explicit_hyphen_penalty, true, e as u32));
            } else if both_cjk && justified {
                let sz = runs[ctx.run_of[ws - 1]].size;
                items.push(Item::glue(0.0, sz * 0.1, 0.0, e as u32, e as u32));
            } else {
                items.push(Item::penalty(0.0, 0.0, false, e as u32));
            }
        }
        i = e;
    }
    let ends_forced = items.last().is_some_and(|it| it.kind == Kind::Penalty && it.penalty <= -kp::INF);
    if !ends_forced || n == 0 || is_newline(text[n - 1]) {
        let mut fill = Item::glue(0.0, 0.0, 0.0, n as u32, n as u32);
        fill.fil = p.align != A_JUSTIFY_ALL;
        items.push(fill);
        items.push(Item::penalty(0.0, -kp::INF, false, n as u32));
    }
    // Tab segment widths.
    for k in 0..items.len() {
        if items[k].kind != Kind::Tab {
            continue;
        }
        let mut seg = 0.0;
        let mut dec: Option<f32> = None;
        let stop = p.tabs.iter().find(|t| t.kind == 3).map(|t| t.align_char).unwrap_or('.' as u32);
        for it in &items[k + 1..] {
            if it.kind == Kind::Tab || (it.kind == Kind::Penalty && it.penalty <= -kp::INF) {
                break;
            }
            if it.kind == Kind::Box && dec.is_none() {
                if let Some(off) = (it.start..it.end).find(|&u| text[u as usize] as u32 == stop || (stop == '.' as u32 && text[u as usize] == ',' as u16)) {
                    dec = Some(seg + ctx.width(it.start as usize, off as usize));
                }
            }
            if it.kind != Kind::Penalty {
                seg += it.width;
            }
        }
        items[k].seg = seg;
        items[k].dec = dec.unwrap_or(seg);
    }

    // ── Break ──
    let mut kpp = p.kp;
    if !justified {
        if kpp.rag <= 0.0 {
            kpp.rag = min_width.min(1e6) * 0.25;
        }
    } else {
        kpp.rag = 0.0;
    }
    let tabfn = |x: f32, seg: f32, dec: f32| resolve_tab(p, x, seg, dec).0;
    let res = if p.algorithm == 1 { kp::first_fit(&items, &p.widths, &kpp, &tabfn) } else { kp::break_paragraph(&items, &p.widths, &kpp, &tabfn) };
    let badness = kp::total_badness(&items, &p.widths, &res.breaks, kpp.rag);
    let mut tab_w: HashMap<u32, f32> = HashMap::new();
    for (k, w) in &res.tabs {
        tab_w.insert(items[*k].start, *w);
    }

    // ── Lines ──
    let mut lines = Vec::with_capacity(res.breaks.len());
    let mut line_start_item = items.iter().position(|it| !matches!(it.kind, Kind::Glue | Kind::Penalty) || it.penalty <= -kp::INF).unwrap_or(0);
    let mut ls = 0usize;
    let nb = res.breaks.len();
    for (li, b) in res.breaks.iter().enumerate() {
        let bi = &items[b.pos];
        let next_start_item = (b.pos + 1..items.len()).find(|&k| !matches!(items[k].kind, Kind::Glue | Kind::Penalty) || items[k].penalty <= -kp::INF).unwrap_or(items.len());
        let le = if li + 1 == nb { n } else { items.get(next_start_item).map(|it| it.start as usize).unwrap_or(n).max(ls) };
        let mut ce = (bi.start as usize).clamp(ls, le);
        while ce > ls && (shape::is_space(text[ce - 1]) || is_newline(text[ce - 1])) {
            ce -= 1;
        }
        let hyphenated = bi.kind == Kind::Penalty && bi.flagged && bi.width > 0.0;
        let forced = bi.kind == Kind::Penalty && bi.penalty <= -kp::INF;
        let last = li + 1 == nb;
        let mut flags = 0;
        if hyphenated {
            flags |= L_HYPHENATED;
        }
        if forced {
            flags |= L_FORCED;
        }
        if last {
            flags |= L_LAST;
        }
        if b.overfull {
            flags |= L_OVERFULL;
        }
        let width = p.widths.get(li).or(p.widths.last()).copied().unwrap_or(1e9);
        let line = build_line(&mut ctx, ls, le, ce, hyphenated, flags, width, b.ratio, para_level, &tab_w);
        lines.push(line);
        ls = le;
        line_start_item = next_start_item;
    }
    let _ = line_start_item;
    ParaLayout { lines, para_level, missing, demerits: res.demerits, algo: res.algo as u32, badness }
}

#[allow(clippy::too_many_arguments)]
fn build_line(ctx: &mut Ctx, ls: usize, le: usize, ce: usize, hyphenated: bool, mut flags: u32, width: f32, ratio: f32, para_level: u8, tab_w: &HashMap<u32, f32>) -> Line {
    let p = ctx.p;
    let text = ctx.text;
    // Collect logical runs for [ls, ce).
    struct R {
        level: u8,
        run: usize,
        end: usize,
        script: [u8; 4],
        glyphs: Vec<Glyph>,
    }
    let mut rs: Vec<R> = Vec::new();
    let hy_run = if hyphenated && ce > 0 { Some(ctx.run_of[ce - 1]) } else { None };
    for si in 0..ctx.segs.len() {
        let (s_start, s_end, s_g0, s_g1, s_level, s_run, s_script) = {
            let s = &ctx.segs[si];
            (s.start, s.end, s.g0, s.g1, s.level, s.run, s.script)
        };
        let a = s_start.max(ls);
        let b = s_end.min(ce);
        if a >= b {
            continue;
        }
        let seg_glyphs = &ctx.glyphs[s_g0..s_g1];
        let unsafe_at = |pos: usize| -> bool { seg_glyphs.iter().find(|g| g.cluster as usize >= pos).is_some_and(|g| g.flags & shape::G_UNSAFE != 0) };
        let cut_start = a > s_start && unsafe_at(a);
        let cut_end = b < s_end && unsafe_at(b);
        let with_hyphen = hyphenated && b == ce;
        let rtl = s_level % 2 == 1;
        let glyphs: Vec<Glyph> = if with_hyphen {
            let (_, hch) = ctx.hyphen(s_run);
            let mut tmp = text[..b].to_vec();
            tmp.push(hch);
            let mut gs = shape::shape_run(ctx.store, &tmp, a, b + 1, &ctx.runs[s_run], rtl, s_script);
            for g in gs.iter_mut() {
                if g.cluster as usize >= b {
                    g.flags |= G_HYPHEN;
                }
            }
            gs
        } else if cut_start || cut_end {
            shape::shape_run(ctx.store, text, a, b, &ctx.runs[s_run], rtl, s_script)
        } else {
            seg_glyphs.iter().filter(|g| (g.cluster as usize) >= a && (g.cluster as usize) < b).copied().collect()
        };
        rs.push(R { level: s_level, run: s_run, end: b, script: s_script, glyphs });
    }
    let _ = hy_run;
    // Desired spacing, tabs.
    let mut space_total = 0.0f32;
    let mut gaps = 0usize;
    let mut gap_size = 0.0f32;
    let mut box_total = 0.0f32;
    for r in rs.iter_mut() {
        let cursive = itemize::is_cursive(&r.script);
        let size = ctx.runs[r.run].size;
        let n = r.glyphs.len();
        for k in 0..n {
            let g = &mut r.glyphs[k];
            if g.flags & G_SPACE != 0 {
                g.x_adv *= p.word[1];
                space_total += g.x_adv;
            } else if g.flags & G_TAB != 0 {
                g.x_adv = tab_w.get(&g.cluster).copied().unwrap_or(0.0);
            } else {
                box_total += g.x_adv;
            }
            let last_of_cluster = k + 1 == n || r.glyphs[k + 1].cluster != r.glyphs[k].cluster;
            if last_of_cluster && !cursive && r.glyphs[k].flags & (G_TAB | G_HYPHEN) == 0 {
                gaps += 1;
                gap_size = gap_size.max(size);
                r.glyphs[k].x_adv += p.letter[1] * size;
            }
        }
    }
    gaps = gaps.saturating_sub(1);
    // Tab positions without the breaker (total-fit never sees tabs, first-fit fills tab_w) —
    // recompute here from the pen position so the line builder is authoritative.
    let leaders: Vec<(usize, usize, f32, u32)>;
    {
        let mut x = 0.0f32;
        let mut stops: Vec<(usize, usize, f32, Option<TabStop>)> = Vec::new();
        for (ri, r) in rs.iter().enumerate() {
            for (gi, g) in r.glyphs.iter().enumerate() {
                if g.flags & G_TAB != 0 {
                    // Following segment natural width.
                    let mut seg = 0.0;
                    let mut dec: Option<f32> = None;
                    'outer: for r2 in rs.iter().skip(ri) {
                        for g2 in r2.glyphs.iter() {
                            if (g2.cluster as usize) <= g.cluster as usize {
                                continue;
                            }
                            if g2.flags & G_TAB != 0 {
                                break 'outer;
                            }
                            let ch = text[g2.cluster as usize];
                            let stopc = p.tabs.iter().find(|t| t.kind == 3).map(|t| t.align_char).unwrap_or('.' as u32);
                            if dec.is_none() && (ch as u32 == stopc) {
                                dec = Some(seg);
                            }
                            seg += g2.x_adv;
                        }
                    }
                    let (w, stop) = resolve_tab(p, x, seg, dec.unwrap_or(seg));
                    stops.push((ri, gi, w, stop));
                    x += w;
                } else {
                    x += g.x_adv;
                }
            }
        }
        for (ri, gi, w, _) in &stops {
            rs[*ri].glyphs[*gi].x_adv = *w;
        }
        // Leaders are attached after positioning (below) using the same stops.
        leaders = stops.iter().map(|(ri, gi, w, s)| (*ri, *gi, *w, s.map(|t| t.leader).unwrap_or(0))).collect();
    }
    let natural: f32 = rs.iter().flat_map(|r| r.glyphs.iter()).map(|g| g.x_adv).sum();
    // Optical margins from the VISUAL edge glyphs.
    let order = itemize::reorder(&rs.iter().map(|r| r.level).collect::<Vec<_>>());
    let edge_char = |r: &R, left: bool| -> Option<(char, f32, bool)> {
        let rtl = r.level % 2 == 1;
        let g = if left ^ rtl { r.glyphs.first() } else { r.glyphs.last() }?;
        if g.flags & G_HYPHEN != 0 {
            return Some(('-', g.x_adv, true));
        }
        let (c, _) = char_at(text, g.cluster as usize);
        Some((c, g.x_adv, false))
    };
    let (mut lp, mut rp) = (0.0f32, 0.0f32);
    if p.oma > 0.0 && !rs.is_empty() {
        if let Some((c, a, _)) = order.first().and_then(|&k| edge_char(&rs[k], true)) {
            lp = protrude::left(c) * a * p.oma;
        }
        if let Some((c, a, _)) = order.last().and_then(|&k| edge_char(&rs[k], false)) {
            rp = protrude::right(c) * a * p.oma;
        }
    }
    let available = width + lp + rp;
    let last = flags & L_LAST != 0;
    let forced = flags & L_FORCED != 0;
    let justify_line = match p.align {
        A_JUSTIFY_ALL => true,
        A_JUSTIFY | A_JUSTIFY_CENTER | A_JUSTIFY_END => !last && !forced,
        _ => false,
    };
    let has_spaces = space_total > 0.0;
    let single_word = justify_line && !has_spaces;
    let mut word_extra_total = 0.0f32;
    let mut letter_extra = 0.0f32;
    let mut gscale = 1.0f32;
    let delta = available - natural;
    let do_justify = justify_line && (!single_word || p.single_word == 1);
    if do_justify && delta.abs() > 0.001 {
        let (wcap, lcap, gcap) = if delta > 0.0 {
            (space_total / p.word[1].max(0.01) * (p.word[2] - p.word[1]).max(0.0), gaps as f32 * gap_size * (p.letter[2] - p.letter[1]).max(0.0), box_total * (p.glyph[2] - p.glyph[1]).max(0.0))
        } else {
            (space_total / p.word[1].max(0.01) * (p.word[1] - p.word[0]).max(0.0), gaps as f32 * gap_size * (p.letter[1] - p.letter[0]).max(0.0), box_total * (p.glyph[1] - p.glyph[0]).max(0.0))
        };
        let mut rem = delta.abs();
        let w = rem.min(wcap);
        rem -= w;
        let l = rem.min(lcap);
        rem -= l;
        let g = rem.min(gcap);
        rem -= g;
        let sign = delta.signum();
        word_extra_total = w * sign;
        letter_extra = if gaps > 0 { l * sign / gaps as f32 } else { 0.0 };
        if box_total > 0.0 {
            gscale = 1.0 + g * sign / box_total;
        }
        if rem > 0.001 && delta > 0.0 {
            // Beyond the maximums: TeX lets word spaces take it (underfull but justified).
            if has_spaces {
                word_extra_total += rem;
            } else if gaps > 0 {
                letter_extra += rem / gaps as f32;
            }
        }
        flags |= L_JUSTIFIED;
    } else if !justify_line && delta < 0.0 && has_spaces {
        // Ragged but too long (rare): compress word spaces to the minimum.
        let cap = space_total / p.word[1].max(0.01) * (p.word[1] - p.word[0]).max(0.0);
        word_extra_total = -(-delta).min(cap);
    }
    // Apply.
    let mut final_w = 0.0f32;
    let mut gi_count = 0usize;
    for r in rs.iter_mut() {
        let cursive = itemize::is_cursive(&r.script);
        let n = r.glyphs.len();
        for k in 0..n {
            let last_of_cluster = k + 1 == n || r.glyphs[k + 1].cluster != r.glyphs[k].cluster;
            let g = &mut r.glyphs[k];
            if g.flags & G_SPACE != 0 {
                if space_total > 0.0 {
                    g.x_adv += word_extra_total * (g.x_adv / space_total);
                }
            } else if g.flags & G_TAB == 0 {
                g.x_adv *= gscale;
                g.x_off *= gscale;
            }
            if last_of_cluster && !cursive && g.flags & (G_TAB | G_HYPHEN) == 0 {
                gi_count += 1;
                if gi_count <= gaps {
                    g.x_adv += letter_extra;
                }
            }
            final_w += g.x_adv;
        }
    }
    // Alignment.
    let rtl_para = para_level % 2 == 1;
    let eff = if justify_line {
        if single_word && !do_justify {
            match p.single_word {
                2 => A_CENTER,
                3 => A_END,
                _ => A_START,
            }
        } else {
            A_JUSTIFY
        }
    } else {
        match p.align {
            A_JUSTIFY | A_JUSTIFY_ALL => A_START,
            A_JUSTIFY_CENTER => A_CENTER,
            A_JUSTIFY_END => A_END,
            a => a,
        }
    };
    let left_align = match eff {
        A_START => !rtl_para,
        A_END => rtl_para,
        A_LEFT => true,
        A_RIGHT => false,
        _ => true,
    };
    let x0 = match eff {
        A_JUSTIFY => -lp,
        A_CENTER => (width - final_w) / 2.0 + (rp - lp) / 2.0,
        _ if left_align => -lp,
        _ => width - final_w + rp,
    };
    // Visual placement.
    let mut out_runs = Vec::with_capacity(rs.len());
    let mut spans: Vec<Span> = Vec::new();
    let mut x = x0;
    let mut ascent = 0.0f32;
    let mut descent = 0.0f32;
    let mut gap = 0.0f32;
    let mut max_size = 0.0f32;
    for &k in &order {
        let r = &rs[k];
        let rtl = r.level % 2 == 1;
        let style = &ctx.runs[r.run];
        let mut vis: Vec<Glyph> = r.glyphs.clone();
        if rtl {
            vis.reverse();
        }
        let run_x = x;
        let mut cx = 0.0f32;
        let mut font = style.fonts.first().copied().unwrap_or(0);
        let mut size = style.size;
        let mut shift = style.shift;
        // Runs may mix fallback fonts or synthesized sizes: split them into homogeneous runs.
        let mut cur: Vec<PGlyph> = Vec::new();
        let mut cur_x = run_x;
        let flush = |cur: &mut Vec<PGlyph>, out: &mut Vec<LineRun>, font: u32, size: f32, shift: f32, x: f32, w: f32| {
            if !cur.is_empty() {
                out.push(LineRun { font, size, level: r.level, style: r.run as u32, x, width: w, shift, scale_x: gscale, flags: 0, glyphs: std::mem::take(cur) });
            }
        };
        for (gi, g) in vis.iter().enumerate() {
            if gi == 0 {
                font = g.font;
                size = g.size;
                shift = g.shift;
            } else if g.font != font || (g.size - size).abs() > 1e-4 || (g.shift - shift).abs() > 1e-4 {
                let w = (run_x + cx) - cur_x;
                flush(&mut cur, &mut out_runs, font, size, shift, cur_x, w);
                cur_x = run_x + cx;
                font = g.font;
                size = g.size;
                shift = g.shift;
            }
            if let Some(inst) = ctx.store.inst(g.font) {
                let m = inst.metrics;
                let sc = g.size / m.upem;
                ascent = ascent.max(m.ascender * sc + g.shift);
                descent = descent.max(-m.descender * sc - g.shift);
                gap = gap.max(m.line_gap * sc);
            }
            if g.flags & G_OBJECT != 0 && g.x_adv > 0.0 {
                ascent = ascent.max(style.obj.1);
                descent = descent.max(style.obj.2);
            }
            max_size = max_size.max(style.size);
            cur.push(PGlyph { gid: g.gid, cluster: g.cluster, x: run_x + cx + g.x_off - cur_x, y: g.y_off, adv: g.x_adv, flags: g.flags });
            cx += g.x_adv;
        }
        let w = (run_x + cx) - cur_x;
        flush(&mut cur, &mut out_runs, font, size, shift, cur_x, w);
        // Leaders for tabs in this run.
        for (ri, gi, tw, leader) in &leaders {
            if *ri != k || *leader == 0 || *tw <= 0.0 {
                continue;
            }
            let g = r.glyphs[*gi];
            let gx = vis.iter().take_while(|v| v.cluster != g.cluster).map(|v| v.x_adv).sum::<f32>() + run_x;
            let lch = [*leader as u16];
            let lg = shape::shape_run(ctx.store, &lch, 0, 1, style, false, *b"Latn");
            let Some(l0) = lg.first().copied() else { continue };
            if l0.x_adv <= 0.0 {
                continue;
            }
            // Align leader dots to a grid from the line origin, as InDesign does.
            let step = l0.x_adv;
            let mut lx = ((gx - x0) / step).ceil() * step + x0;
            let mut lgs = Vec::new();
            while lx + step <= gx + tw + 0.01 {
                lgs.push(PGlyph { gid: l0.gid, cluster: g.cluster, x: lx - gx, y: 0.0, adv: step, flags: G_LEADER });
                lx += step;
            }
            if !lgs.is_empty() {
                out_runs.push(LineRun { font: l0.font, size: l0.size, level: r.level, style: r.run as u32, x: gx, width: *tw, shift: 0.0, scale_x: 1.0, flags: G_LEADER, glyphs: lgs });
            }
        }
        // Caret spans: per cluster, split ligatures by grapheme count.
        let mut cluster_starts: Vec<u32> = r.glyphs.iter().map(|g| g.cluster).collect();
        cluster_starts.sort_unstable();
        cluster_starts.dedup();
        let mut px = run_x;
        let mut i = 0;
        while i < vis.len() {
            let c = vis[i].cluster;
            let mut j = i;
            let mut w = 0.0;
            while j < vis.len() && vis[j].cluster == c {
                w += vis[j].x_adv;
                j += 1;
            }
            if vis[i].flags & G_HYPHEN != 0 {
                px += w;
                i = j;
                continue;
            }
            // Logical extent of this cluster: the next larger cluster value in the run.
            let cs = c as usize;
            let cend = match cluster_starts.binary_search(&c) {
                Ok(k) | Err(k) => cluster_starts.get(k + 1).map(|&v| v as usize).unwrap_or(r.end),
            };
            let cend = cend.min(r.end).max(cs + 1);
            let s = String::from_utf16_lossy(&text[cs..cend]);
            let mut bounds: Vec<usize> = Vec::new();
            let mut off = cs;
            for gr in s.graphemes(true) {
                bounds.push(off);
                off += gr.encode_utf16().count();
            }
            bounds.push(cend);
            let k = bounds.len() - 1;
            for q in 0..k {
                let (a, b) = if rtl { (px + w * (k - q - 1) as f32 / k as f32, px + w * (k - q) as f32 / k as f32) } else { (px + w * q as f32 / k as f32, px + w * (q + 1) as f32 / k as f32) };
                spans.push(Span { start: bounds[q] as u32, end: bounds[q + 1] as u32, x0: a, x1: b, rtl });
            }
            px += w;
            i = j;
        }
        x += cx;
    }
    // Trailing whitespace / newline: zero-width spans at the visual end of the line.
    let end_x = if rtl_para { x0 } else { x0 + final_w };
    let mut u = ce;
    while u < le {
        let (_, w) = char_at(text, u);
        spans.push(Span { start: u as u32, end: (u + w) as u32, x0: end_x, x1: end_x, rtl: rtl_para });
        u += w;
    }
    if rs.is_empty() {
        let r = &ctx.runs[ctx.run_of.get(ls.min(ctx.run_of.len().saturating_sub(1))).copied().unwrap_or(0)];
        if let Some(inst) = r.fonts.first().and_then(|&f| ctx.store.inst(f)) {
            let m = inst.metrics;
            let sc = r.size / m.upem;
            ascent = m.ascender * sc;
            descent = -m.descender * sc;
            gap = m.line_gap * sc;
        }
        max_size = r.size;
    }
    Line {
        start: ls as u32,
        end: le as u32,
        content_end: ce as u32,
        flags,
        x: x0,
        width: final_w,
        natural,
        ascent,
        descent,
        line_gap: gap,
        max_size,
        ratio,
        glyph_scale: gscale,
        word_extra: word_extra_total,
        letter_extra,
        runs: out_runs,
        spans,
    }
}
