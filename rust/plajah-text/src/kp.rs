//! Knuth–Plass total-fit line breaking (Knuth & Plass 1981, "Breaking Paragraphs into Lines"),
//! as in TeX §813–890, plus the extensions a modern compositor needs:
//!
//! * boxes carry their own stretch/shrink, so letter-spacing and glyph-scaling ranges join word
//!   spacing as justification resources (pdfTeX font expansion / InDesign's three spacing rows);
//! * per-break protrusion (optical margin alignment) widens the measure for lines that start or
//!   end with hanging glyphs;
//! * arbitrary per-line measures (`widths`, last entry repeats) — columns, wraps, drop caps;
//! * a ragged mode (TeX's `\rightskip` stretch) so unjustified text also gets total-fit rag;
//! * three passes (pretolerance without hyphenation, tolerance with, emergency stretch with
//!   artificial demerits so it always returns), looseness, consecutive-hyphen limit, final
//!   hyphen demerits and a minimum last-line length;
//! * a first-fit fallback for giant paragraphs or when the active list explodes.
//!
//! Elastic material is TIERED (word spaces, then letter spacing, then glyph scaling): the
//! adjustment ratio consumes the tiers in priority order and charges the later tiers more, so
//! the composer prefers re-spacing words, then hyphenating, and only then touches letterforms.
//! The tier idea, Knuth's per-class pruning and the ragged hyphenation zone follow DesignCraft's
//! compose/breaker.rs (github.com/storytold/designcraft, MIT OR Apache-2.0), studied as a
//! reference and reimplemented here; see docs/text/TEXT_ENGINE.md.

/// Cost multiplier per tier (word, letter, glyph).
pub const TIER_COST: [f64; 3] = [1.0, 1.4, 1.8];

pub const INF: f32 = 10000.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Box,
    Glue,
    Penalty,
    Tab,
}

#[derive(Clone, Copy, Debug)]
pub struct Item {
    pub kind: Kind,
    pub width: f32,
    /// Word-space (tier 0) stretch/shrink — glue.
    pub stretch: f32,
    pub shrink: f32,
    /// Letter-spacing (tier 1) and glyph-scaling (tier 2) stretch/shrink — boxes.
    pub lstretch: f32,
    pub lshrink: f32,
    pub gstretch: f32,
    pub gshrink: f32,
    /// Infinite-order stretch (paragraph fill).
    pub fil: bool,
    pub penalty: f32,
    pub flagged: bool,
    /// Automatic hyphenation point (skipped on the first pass).
    pub auto_hyph: bool,
    /// Protrusion when this box starts a line / when a line ends here.
    pub lp: f32,
    pub rp: f32,
    pub start: u32,
    pub end: u32,
    /// Tab helpers: natural width of the following tab segment, and width up to its decimal mark.
    pub seg: f32,
    pub dec: f32,
}

impl Item {
    pub fn bx(width: f32, start: u32, end: u32) -> Self {
        Self { kind: Kind::Box, width, stretch: 0.0, shrink: 0.0, lstretch: 0.0, lshrink: 0.0, gstretch: 0.0, gshrink: 0.0, fil: false, penalty: 0.0, flagged: false, auto_hyph: false, lp: 0.0, rp: 0.0, start, end, seg: 0.0, dec: 0.0 }
    }
    pub fn glue(width: f32, stretch: f32, shrink: f32, start: u32, end: u32) -> Self {
        Self { kind: Kind::Glue, stretch, shrink, ..Self::bx(width, start, end) }
    }
    pub fn penalty(width: f32, penalty: f32, flagged: bool, at: u32) -> Self {
        Self { kind: Kind::Penalty, penalty, flagged, ..Self::bx(width, at, at) }
    }
    #[inline]
    fn discardable(&self) -> bool {
        matches!(self.kind, Kind::Glue | Kind::Penalty)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Params {
    pub pretolerance: f32,
    pub tolerance: f32,
    pub line_penalty: f32,
    pub double_hyphen_demerits: f32,
    pub final_hyphen_demerits: f32,
    pub adj_demerits: f32,
    pub looseness: i32,
    pub emergency_stretch: f32,
    pub max_hyphens: u32,
    /// Ragged-edge stretch per line (0 = justified).
    pub rag: f32,
    /// Minimum last-line length as a fraction of its measure (0 = off).
    pub last_min: f32,
    /// Item count above which total-fit is skipped.
    pub max_items: usize,
    /// Hyphenation zone (ragged text, px): skip a hyphen when breaking before the word would
    /// leave less than this at the line end.
    pub hyph_zone: f32,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            pretolerance: 100.0,
            tolerance: 200.0,
            line_penalty: 10.0,
            double_hyphen_demerits: 10000.0,
            final_hyphen_demerits: 5000.0,
            adj_demerits: 10000.0,
            looseness: 0,
            emergency_stretch: 0.0,
            max_hyphens: 3,
            rag: 0.0,
            last_min: 0.0,
            max_items: 40000,
            hyph_zone: 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Break {
    pub pos: usize,
    pub ratio: f32,
    pub overfull: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Algo {
    TotalFit = 0,
    TotalFitHyph = 1,
    TotalFitEmergency = 2,
    FirstFit = 3,
}

pub struct Result {
    pub breaks: Vec<Break>,
    pub demerits: f64,
    pub algo: Algo,
    /// Width override per tab item (index → width), first-fit only.
    pub tabs: Vec<(usize, f32)>,
}

struct Sums {
    w: Vec<f64>,
    y: Vec<[f64; 3]>,
    z: Vec<[f64; 3]>,
    fil: Vec<u32>,
    /// First line-content index after a break at i (skips discardables).
    after: Vec<usize>,
}

fn sums(items: &[Item]) -> Sums {
    let n = items.len();
    let (mut w, mut y, mut z, mut fil) = (Vec::with_capacity(n + 1), Vec::with_capacity(n + 1), Vec::with_capacity(n + 1), Vec::with_capacity(n + 1));
    let (mut sw, mut sy, mut sz, mut sf) = (0.0f64, [0.0f64; 3], [0.0f64; 3], 0u32);
    for it in items {
        w.push(sw);
        y.push(sy);
        z.push(sz);
        fil.push(sf);
        match it.kind {
            Kind::Box | Kind::Tab | Kind::Glue => {
                sw += it.width as f64;
                sy[0] += it.stretch as f64;
                sz[0] += it.shrink as f64;
                sy[1] += it.lstretch as f64;
                sz[1] += it.lshrink as f64;
                sy[2] += it.gstretch as f64;
                sz[2] += it.gshrink as f64;
                if it.fil {
                    sf += 1;
                }
            }
            Kind::Penalty => {}
        }
    }
    w.push(sw);
    y.push(sy);
    z.push(sz);
    fil.push(sf);
    let mut after = vec![n; n + 1];
    let mut next = n;
    for i in (0..n).rev() {
        if !items[i].discardable() || (items[i].kind == Kind::Penalty && items[i].penalty <= -INF) {
            next = i;
        }
        after[i] = next;
    }
    // After a break at i, content starts at the first non-discardable item strictly after i.
    let mut out = vec![n; n + 1];
    for i in 0..n {
        out[i] = after[i + 1];
    }
    Sums { w, y, z, fil, after: out }
}

#[inline]
fn is_break(items: &[Item], b: usize) -> bool {
    let it = &items[b];
    match it.kind {
        Kind::Glue => b > 0 && matches!(items[b - 1].kind, Kind::Box | Kind::Tab),
        Kind::Penalty => it.penalty < INF,
        _ => false,
    }
}

fn prev_box(items: &[Item], b: usize) -> Option<usize> {
    (0..b).rev().find(|&i| matches!(items[i].kind, Kind::Box | Kind::Tab))
}

fn right_protrusion(items: &[Item], b: usize) -> f32 {
    let it = &items[b];
    if it.kind == Kind::Penalty && it.width > 0.0 {
        return it.rp;
    }
    prev_box(items, b).map(|i| items[i].rp).unwrap_or(0.0)
}

fn left_protrusion(items: &[Item], start: usize) -> f32 {
    items.get(start).filter(|i| i.kind == Kind::Box).map(|i| i.lp).unwrap_or(0.0)
}

#[inline]
fn line_width(widths: &[f32], l: usize) -> f32 {
    widths.get(l).or(widths.last()).copied().unwrap_or(1e9)
}

#[derive(Clone, Copy)]
struct Node {
    pos: usize,
    start: usize,
    line: usize,
    fit: u8,
    dem: f64,
    hy: u32,
    prev: usize,
    ratio: f32,
    flagged: bool,
    overfull: bool,
}

/// Adjustment ratio for `d` px using the tiers in priority order (cost-weighted). Shrinking
/// beyond every tier returns < -1 (infeasible); stretching beyond them keeps growing word space.
pub fn tiered_ratio(d: f64, y: [f64; 3], z: [f64; 3]) -> f64 {
    const EPS: f64 = 1e-9;
    if d.abs() < 1e-6 {
        return 0.0;
    }
    let (mut rem, cap) = if d > 0.0 { (d, y) } else { (-d, z) };
    let mut r = 0.0;
    for t in 0..3 {
        if cap[t] > EPS && rem > EPS {
            let take = rem.min(cap[t]);
            r += TIER_COST[t] * take / cap[t];
            rem -= take;
        }
    }
    if d < 0.0 {
        return if rem > 1e-4 { -1e6 } else { -r.min(1.0) };
    }
    if rem > 1e-4 {
        let unit = if cap[0] > EPS { cap[0] } else { cap.iter().sum::<f64>() };
        return if unit > EPS { r + rem / unit } else { 1e6 };
    }
    r
}

fn ratio(s: &Sums, items: &[Item], a_start: usize, b: usize, width: f64, extra_stretch: f64) -> f64 {
    let a = a_start.min(b);
    let pen_w = if items[b].kind == Kind::Penalty { items[b].width as f64 } else { 0.0 };
    let natural = s.w[b] - s.w[a] + pen_w;
    let mut d = width - natural;
    // A line that overruns by a rounding error fits exactly.
    if d < 0.0 && d > -0.01 {
        d = 0.0;
    }
    if d > 0.0 && s.fil[b] > s.fil[a] {
        return 0.0;
    }
    let mut y = [0.0; 3];
    let mut z = [0.0; 3];
    for t in 0..3 {
        y[t] = s.y[b][t] - s.y[a][t];
        z[t] = s.z[b][t] - s.z[a][t];
    }
    y[0] += extra_stretch;
    tiered_ratio(d, y, z)
}

fn natural_width(s: &Sums, items: &[Item], a_start: usize, b: usize) -> f64 {
    let pen_w = if items[b].kind == Kind::Penalty { items[b].width as f64 } else { 0.0 };
    s.w[b] - s.w[a_start.min(b)] + pen_w
}

enum PassOut {
    Done(Vec<Node>, usize),
    Failed,
    TooBig,
}

fn pass(items: &[Item], s: &Sums, widths: &[f32], p: &Params, tolerance: f32, hyph: bool, emergency: f32, final_pass: bool) -> PassOut {
    let n = items.len();
    let exact_lines = p.looseness != 0;
    let wl = widths.len().max(1);
    let mut arena: Vec<Node> = vec![Node { pos: 0, start: first_content(items), line: 0, fit: 1, dem: 0.0, hy: 0, prev: usize::MAX, ratio: 0.0, flagged: false, overfull: false }];
    let mut active: Vec<usize> = vec![0];
    let rag = p.rag as f64 + emergency as f64;
    for b in 0..n {
        if !is_break(items, b) {
            continue;
        }
        if !hyph && items[b].auto_hyph {
            continue;
        }
        let it = &items[b];
        let forced = it.kind == Kind::Penalty && it.penalty <= -INF;
        let flagged = it.kind == Kind::Penalty && it.flagged;
        let rp = right_protrusion(items, b) as f64;
        // best[(class, fit)] → (dem, from, ratio)
        let mut cands: Vec<(usize, u8, f64, usize, f32, u32)> = Vec::new();
        let mut artificial = false;
        let mut keep: Vec<usize> = Vec::with_capacity(active.len());
        let mut dropped: Vec<usize> = Vec::new();
        for &ai in &active {
            let a = arena[ai];
            let width = line_width(widths, a.line) as f64 + left_protrusion(items, a.start) as f64 + rp;
            let r = ratio(s, items, a.start, b, width, rag);
            if r < -1.0 || forced {
                if r < -1.0 {
                    dropped.push(ai);
                } else {
                    keep.push(ai); // re-evaluated below; forced breaks deactivate after use
                }
            } else {
                keep.push(ai);
            }
            if r < -1.0 {
                continue;
            }
            // Feasibility uses TeX's capped badness; demerits use the uncapped value so that, in the
            // emergency pass, a very loose line is still worse than a merely loose one.
            let raw = (100.0 * r.abs().powi(3)).min(1.0e7);
            let bad = raw.min(10000.0);
            if bad > tolerance as f64 {
                continue;
            }
            let mut d = (p.line_penalty as f64 + raw).powi(2);
            if it.kind == Kind::Penalty {
                let pen = it.penalty as f64;
                if pen >= 0.0 {
                    d += pen * pen;
                } else if pen > -(INF as f64) {
                    d -= pen * pen;
                }
            }
            if flagged && a.flagged {
                d += p.double_hyphen_demerits as f64;
            }
            if forced && a.flagged {
                d += p.final_hyphen_demerits as f64;
            }
            if forced && p.last_min > 0.0 {
                let lw = line_width(widths, a.line) as f64;
                let nat = natural_width(s, items, a.start, b);
                let want = p.last_min as f64 * lw;
                if nat < want && a.line > 0 {
                    let short = (want - nat) / lw;
                    d += 2.0e5 * short;
                }
            }
            let fit: u8 = if r < -0.5 { 0 } else if r <= 0.5 { 1 } else if r <= 1.0 { 2 } else { 3 };
            if (fit as i32 - a.fit as i32).abs() > 1 {
                d += p.adj_demerits as f64;
            }
            let hy = if flagged { a.hy + 1 } else { 0 };
            if p.max_hyphens > 0 && hy > p.max_hyphens {
                continue;
            }
            if it.auto_hyph && p.rag > 0.0 && p.hyph_zone > 0.0 {
                if let Some(g) = (a.start..b).rev().find(|&k| items[k].kind == Kind::Glue) {
                    let before = s.w[g] - s.w[a.start.min(g)];
                    if line_width(widths, a.line) as f64 - before < p.hyph_zone as f64 {
                        continue;
                    }
                }
            }
            let total = a.dem + d;
            let line = a.line + 1;
            let class = if exact_lines { line } else { line.min(wl) };
            match cands.iter_mut().find(|c| c.0 == class && c.1 == fit) {
                Some(c) => {
                    if total < c.2 {
                        *c = (class, fit, total, ai, r as f32, hy);
                    }
                }
                None => cands.push((class, fit, total, ai, r as f32, hy)),
            }
        }
        if forced {
            keep.clear();
        }
        if cands.is_empty() && keep.is_empty() && final_pass {
            // Artificial demerits (TeX §854): every route is overfull; take the least bad.
            if let Some(&ai) = dropped.iter().min_by(|&&x, &&y| arena[x].dem.partial_cmp(&arena[y].dem).unwrap()) {
                let a = arena[ai];
                cands.push((a.line + 1, 1, a.dem, ai, -1.0, if flagged { a.hy + 1 } else { 0 }));
                artificial = true;
            }
        }
        let overfull_art = artificial;
        active = keep;
        let start = s.after[b];
        // Knuth's pruning: a fitness class only earns a node within adj_demerits of the best.
        let min_d = cands.iter().map(|c| c.2).fold(f64::INFINITY, f64::min);
        cands.retain(|c| c.2 <= min_d + p.adj_demerits as f64);
        for (_, fit, dem, from, r, hy) in cands {
            let line = arena[from].line + 1;
            arena.push(Node { pos: b, start, line, fit, dem, hy, prev: from, ratio: r, flagged, overfull: overfull_art });
            active.push(arena.len() - 1);
        }
        if active.len() > 6000 {
            return PassOut::TooBig;
        }
        if active.is_empty() {
            return PassOut::Failed;
        }
    }
    // Final candidates are nodes at the last item.
    let finals: Vec<usize> = active.iter().copied().filter(|&i| arena[i].pos == n - 1).collect();
    if finals.is_empty() {
        return PassOut::Failed;
    }
    let mut best = *finals.iter().min_by(|&&x, &&y| arena[x].dem.partial_cmp(&arena[y].dem).unwrap()).unwrap();
    if p.looseness != 0 {
        let target = arena[best].line as i64 + p.looseness as i64;
        best = *finals
            .iter()
            .min_by(|&&x, &&y| {
                let dx = (arena[x].line as i64 - target).abs();
                let dy = (arena[y].line as i64 - target).abs();
                dx.cmp(&dy).then(arena[x].dem.partial_cmp(&arena[y].dem).unwrap())
            })
            .unwrap();
    }
    PassOut::Done(arena, best)
}

fn first_content(items: &[Item]) -> usize {
    items.iter().position(|i| !i.discardable() || (i.kind == Kind::Penalty && i.penalty <= -INF)).unwrap_or(items.len())
}

/// Tab width from (pen x, following segment width, width up to the decimal mark).
pub type TabFn<'a> = &'a dyn Fn(f32, f32, f32) -> f32;

fn collect(arena: &[Node], best: usize) -> Vec<Break> {
    let mut out = Vec::new();
    let mut i = best;
    while i != usize::MAX && arena[i].prev != usize::MAX {
        out.push(Break { pos: arena[i].pos, ratio: arena[i].ratio, overfull: arena[i].overfull });
        i = arena[i].prev;
    }
    out.reverse();
    out
}

/// Total-fit with TeX's pass structure; falls back to first-fit for giant paragraphs.
pub fn break_paragraph(items: &[Item], widths: &[f32], p: &Params, tab: TabFn) -> Result {
    if items.is_empty() {
        return Result { breaks: Vec::new(), demerits: 0.0, algo: Algo::TotalFit, tabs: Vec::new() };
    }
    if items.len() > p.max_items || items.iter().any(|i| i.kind == Kind::Tab) {
        return first_fit(items, widths, p, tab);
    }
    let s = sums(items);
    let has_hyph = items.iter().any(|i| i.auto_hyph);
    if p.pretolerance >= 0.0 {
        match pass(items, &s, widths, p, p.pretolerance, false, 0.0, false) {
            PassOut::Done(a, b) => return Result { breaks: collect(&a, b), demerits: a[b].dem, algo: Algo::TotalFit, tabs: Vec::new() },
            PassOut::TooBig => return first_fit(items, widths, p, tab),
            PassOut::Failed => {}
        }
    }
    let second_final = p.emergency_stretch <= 0.0 && !has_hyph;
    if has_hyph || p.pretolerance < 0.0 {
        match pass(items, &s, widths, p, p.tolerance, true, 0.0, second_final) {
            PassOut::Done(a, b) => return Result { breaks: collect(&a, b), demerits: a[b].dem, algo: Algo::TotalFitHyph, tabs: Vec::new() },
            PassOut::TooBig => return first_fit(items, widths, p, tab),
            PassOut::Failed => {}
        }
    }
    match pass(items, &s, widths, p, 10000.0, true, p.emergency_stretch, true) {
        PassOut::Done(a, b) => Result { breaks: collect(&a, b), demerits: a[b].dem, algo: Algo::TotalFitEmergency, tabs: Vec::new() },
        _ => first_fit(items, widths, p, tab),
    }
}

/// First-fit ("single-line composer"): fills each line as far as shrink allows, but backs off
/// from a hyphen when an earlier word break is not loose. Also the only mode that resolves tabs,
/// whose width depends on the pen position.
pub fn first_fit(items: &[Item], widths: &[f32], p: &Params, tab: TabFn) -> Result {
    let n = items.len();
    let mut work: Vec<Item> = items.to_vec();
    let mut tabs = Vec::new();
    let mut breaks = Vec::new();
    let mut start = first_content(items);
    let mut line = 0usize;
    while start < n {
        let lw = line_width(widths, line) as f64;
        // Resolve tabs on this line against the pen position.
        let mut x = 0.0f64;
        let mut last_ok: Option<(usize, f64)> = None;
        let mut last_word: Option<(usize, f64)> = None;
        let mut chosen: Option<usize> = None;
        let mut i = start;
        let mut w = 0.0f64;
        let mut y = 0.0f64;
        let mut z = 0.0f64;
        let lp = left_protrusion(&work, start) as f64;
        while i < n {
            let it = work[i];
            if it.kind == Kind::Tab {
                let tw = tab(x as f32, it.seg, it.dec) as f64;
                work[i].width = tw as f32;
                tabs.push((i, tw as f32));
            }
            let it = work[i];
            if is_break(&work, i) && i > start {
                let pen_w = if it.kind == Kind::Penalty { it.width as f64 } else { 0.0 };
                let width = lw + lp + right_protrusion(&work, i) as f64;
                let nat = w + pen_w;
                let fits = nat - z <= width + 1e-6;
                let forced = it.kind == Kind::Penalty && it.penalty <= -INF;
                if fits {
                    let r = if nat < width { if y + p.rag as f64 > 0.0 { (width - nat) / (y + p.rag as f64) } else { 1e6 } } else if z > 0.0 { (width - nat) / z } else { 0.0 };
                    last_ok = Some((i, r));
                    if !(it.kind == Kind::Penalty && it.flagged) {
                        last_word = Some((i, r));
                    }
                    if forced {
                        chosen = Some(i);
                        break;
                    }
                } else {
                    if last_ok.is_none() {
                        chosen = Some(i); // overfull: nothing fits
                    }
                    break;
                }
            }
            match it.kind {
                Kind::Box | Kind::Tab | Kind::Glue => {
                    w += it.width as f64;
                    y += (it.stretch + it.lstretch + it.gstretch) as f64;
                    z += (it.shrink + it.lshrink + it.gshrink) as f64;
                }
                _ => {}
            }
            x = w;
            i += 1;
        }
        let pick = match chosen {
            Some(c) => c,
            None => match (last_ok, last_word) {
                (Some((h, _)), Some((wd, rw))) if work[h].flagged && h != wd && rw <= 1.0 => wd,
                (Some((h, _)), _) => h,
                (None, _) => n - 1,
            },
        };
        let r = last_ok.filter(|(b, _)| *b == pick).map(|(_, r)| r as f32).unwrap_or(0.0);
        breaks.push(Break { pos: pick, ratio: r, overfull: chosen == Some(pick) && last_ok.is_none() });
        if pick >= n - 1 {
            break;
        }
        start = (pick + 1..n).find(|&k| !work[k].discardable() || (work[k].kind == Kind::Penalty && work[k].penalty <= -INF)).unwrap_or(n);
        line += 1;
    }
    Result { breaks, demerits: 0.0, algo: Algo::FirstFit, tabs }
}

/// Sum of TeX badness over lines — the quality score tests and the proof sheet compare.
pub fn total_badness(items: &[Item], widths: &[f32], breaks: &[Break], rag: f32) -> f64 {
    let s = sums(items);
    let mut start = first_content(items);
    let mut total = 0.0;
    for (l, b) in breaks.iter().enumerate() {
        let w = line_width(widths, l) as f64 + left_protrusion(items, start) as f64 + right_protrusion(items, b.pos) as f64;
        let r = ratio(&s, items, start, b.pos, w, rag as f64);
        total += (100.0 * r.abs().powi(3)).min(10000.0);
        start = s.after[b.pos];
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOTAB: fn(f32, f32, f32) -> f32 = |_, _, _| 0.0;

    /// Words of fixed-width "glyphs": each char = 10 units, space 10 (stretch 5, shrink 3).
    fn items_for(text: &str) -> Vec<Item> {
        let mut v = Vec::new();
        let mut pos = 0u32;
        let words: Vec<&str> = text.split(' ').collect();
        for (k, w) in words.iter().enumerate() {
            let len = w.chars().count() as u32;
            v.push(Item::bx(10.0 * len as f32, pos, pos + len));
            pos += len;
            if k + 1 < words.len() {
                v.push(Item::glue(10.0, 5.0, 3.0, pos, pos + 1));
                pos += 1;
            }
        }
        let mut fill = Item::glue(0.0, 0.0, 0.0, pos, pos);
        fill.fil = true;
        v.push(fill);
        v.push(Item::penalty(0.0, -INF, false, pos));
        v
    }

    const TEXT: &str = "In olden times when wishing still helped one there lived a king whose daughters were all beautiful but the youngest was so beautiful that the sun itself which has seen so much was astonished whenever it shone in her face";

    #[test]
    fn total_fit_beats_first_fit() {
        let items = items_for(TEXT);
        let widths = [390.0];
        let p = Params::default();
        let kp = break_paragraph(&items, &widths, &p, &NOTAB);
        let ff = first_fit(&items, &widths, &p, &NOTAB);
        assert!(!kp.breaks.is_empty());
        // Exclude the last line (fil) — compare the justified lines only.
        let bk = total_badness(&items, &widths, &kp.breaks[..kp.breaks.len() - 1], 0.0);
        let bf = total_badness(&items, &widths, &ff.breaks[..ff.breaks.len() - 1], 0.0);
        assert!(bk <= bf, "total-fit badness {bk} should not exceed first-fit {bf}");
        for b in &kp.breaks {
            assert!(b.ratio >= -1.0);
        }
    }

    #[test]
    fn variable_widths_and_looseness() {
        let items = items_for(TEXT);
        let p = Params::default();
        let a = break_paragraph(&items, &[200.0, 250.0, 300.0, 390.0], &p, &NOTAB);
        assert!(a.breaks.len() >= 5);
        let mut pl = p;
        pl.looseness = 1;
        let b = break_paragraph(&items, &[390.0], &pl, &NOTAB);
        let c = break_paragraph(&items, &[390.0], &p, &NOTAB);
        assert!(b.breaks.len() >= c.breaks.len());
    }

    #[test]
    fn overlong_word_still_breaks() {
        let items = items_for("a supercalifragilisticexpialidocious b");
        let r = break_paragraph(&items, &[100.0], &Params::default(), &NOTAB);
        assert!(r.breaks.len() >= 2);
        assert_eq!(r.breaks.last().unwrap().pos, items.len() - 1);
    }
}
