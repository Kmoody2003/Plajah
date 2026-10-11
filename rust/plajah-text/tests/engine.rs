//! Engine tests against real OFL fonts from the shared cache (`.cache/text-fonts`, filled by
//! `npm run test:text` / `services/text/fonts/nodeCache.ts`). Tests skip — loudly — when a font
//! is missing so `cargo test` still works offline.

use plajah_text::fonts::FontStore;
use plajah_text::hyph::Hyphenator;
use plajah_text::para::{self, ParaParams};
use plajah_text::shape::{self, RunStyle};
use std::collections::HashMap;
use std::path::PathBuf;

fn cache(name: &str) -> Option<Vec<u8>> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.cache/text-fonts").join(name);
    match std::fs::read(&p) {
        Ok(b) => Some(b),
        Err(_) => {
            eprintln!("SKIP: font {} not cached", p.display());
            None
        }
    }
}

fn u(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

fn inst(store: &mut FontStore, file: &str, axes: &[(&[u8; 4], f32)]) -> Option<u32> {
    let b = store.load_blob(cache(file)?);
    assert!(b >= 0, "{file} did not parse");
    let coords: Vec<_> = axes.iter().map(|(t, v)| (rustybuzz::ttf_parser::Tag::from_bytes(t), *v)).collect();
    let i = store.create_instance(b as u32, 0, &coords);
    assert!(i >= 0);
    Some(i as u32)
}

fn hyphs() -> HashMap<u32, Hyphenator> {
    let mut m = HashMap::new();
    m.insert(0, Hyphenator::load(include_str!("../../../services/text/hyphenation/patterns/en-us.pat.txt"), include_str!("../../../services/text/hyphenation/patterns/en-us.hyp.txt"), 2, 3));
    m
}

#[test]
fn ligature_and_caret_split() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let t = u("office");
    let gs = shape::shape_run(&s, &t, 0, t.len(), &RunStyle::simple(0, t.len(), f, 20.0), false, *b"Latn");
    assert!(gs.len() < t.len(), "expected an ffi ligature, got {} glyphs", gs.len());
    // Caret spans split the ligature per grapheme.
    let p = ParaParams { align: para::A_START, widths: vec![1000.0], ..Default::default() };
    let lay = para::layout(&s, &HashMap::new(), &t, &[RunStyle::simple(0, t.len(), f, 20.0)], &p);
    let spans = &lay.lines[0].spans;
    assert_eq!(spans.len(), 6);
    for w in spans.windows(2) {
        assert!(w[1].x0 >= w[0].x0 - 1e-3 && w[1].x0 > w[0].x0 - 0.01);
    }
    assert!(spans[2].x1 > spans[1].x1 && spans[3].x1 > spans[2].x1, "f|f|i carets distinct");
}

#[test]
fn kerning_av() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "Inter[opsz,wght].ttf", &[(b"wght", 400.0)]) else { return };
    let run = |t: &[u16]| shape::shape_run(&s, t, 0, t.len(), &RunStyle::simple(0, t.len(), f, 100.0), false, *b"Latn").iter().map(|g| g.x_adv).sum::<f32>();
    let av = run(&u("AV"));
    let sep = run(&u("A")) + run(&u("V"));
    assert!(av < sep - 1.0, "AV {av} should kern tighter than {sep}");
    let mut kern_off = RunStyle::simple(0, 2, f, 100.0);
    kern_off.features.push((rustybuzz::ttf_parser::Tag::from_bytes(b"kern"), 0));
    let t = u("AV");
    let w = shape::shape_run(&s, &t, 0, 2, &kern_off, false, *b"Latn").iter().map(|g| g.x_adv).sum::<f32>();
    assert!((w - sep).abs() < 0.5, "kern=0 should disable kerning");
}

#[test]
fn variable_axes_change_advances() {
    let mut s = FontStore::default();
    let Some(thin) = inst(&mut s, "Inter[opsz,wght].ttf", &[(b"wght", 100.0)]) else { return };
    let Some(black) = inst(&mut s, "Inter[opsz,wght].ttf", &[(b"wght", 900.0)]) else { return };
    let t = u("Hamburgefonstiv");
    let w = |f| shape::shape_run(&s, &t, 0, t.len(), &RunStyle::simple(0, t.len(), f, 40.0), false, *b"Latn").iter().map(|g| g.x_adv).sum::<f32>();
    assert!(w(black) > w(thin) * 1.05);
}

#[test]
fn arabic_joins() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "NotoSansArabic[wdth,wght].ttf", &[]) else { return };
    let word = u("\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}");
    let joined = shape::shape_run(&s, &word, 0, word.len(), &RunStyle::simple(0, word.len(), f, 30.0), true, *b"Arab");
    let iso: Vec<u16> = (0..word.len())
        .map(|i| shape::shape_run(&s, &word[i..i + 1], 0, 1, &RunStyle::simple(0, 1, f, 30.0), true, *b"Arab")[0].gid)
        .collect();
    // Logical order: first glyph is meem in initial form ≠ isolated meem.
    assert_ne!(joined[0].gid, iso[0], "meem must take its initial form");
    assert!(joined.iter().all(|g| g.gid != 0));
}

#[test]
fn devanagari_reorders() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "NotoSansDevanagari[wdth,wght].ttf", &[]) else { return };
    // कि: the i-matra (U+093F) is drawn BEFORE the consonant.
    let t = u("\u{0915}\u{093F}");
    let gs = shape::shape_run(&s, &t, 0, t.len(), &RunStyle::simple(0, t.len(), f, 30.0), false, *b"Deva");
    let ka = s.inst(f).unwrap().glyph('\u{0915}').unwrap();
    assert_eq!(gs.len(), 2);
    assert_eq!(gs[1].gid, ka, "matra glyph precedes ka visually");
    // Conjunct क्ष collapses into fewer glyphs than code points.
    let k = u("\u{0915}\u{094D}\u{0937}");
    let gk = shape::shape_run(&s, &k, 0, k.len(), &RunStyle::simple(0, k.len(), f, 30.0), false, *b"Deva");
    assert!(gk.len() < 3);
}

const PARA: &str = "Typography is the craft of endowing human language with a durable visual form. Its heartwood is the justified paragraph, where every line must be filled exactly to the measure without opening rivers of white space or crowding the letters together, and where the compositor balances the whole paragraph rather than each line alone.";

fn justified(s: &FontStore, f: u32, width: f32, algo: u32, oma: f32) -> para::ParaLayout {
    let t = u(PARA);
    let mut run = RunStyle::simple(0, t.len(), f, 12.0);
    run.hyph = Some(0);
    let p = ParaParams { align: para::A_JUSTIFY, widths: vec![width], algorithm: algo, oma, ..Default::default() };
    para::layout(s, &hyphs(), &t, &[run], &p)
}

#[test]
fn justified_lines_fill_the_measure() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let lay = justified(&s, f, 220.0, 0, 0.0);
    assert!(lay.lines.len() > 4);
    for (i, l) in lay.lines.iter().enumerate() {
        let last = i + 1 == lay.lines.len();
        if !last {
            assert!((l.x + l.width - 220.0).abs() < 0.05 && l.x.abs() < 0.05, "line {i} spans {}..{}", l.x, l.x + l.width);
        }
    }
    assert!(lay.lines.iter().any(|l| l.flags & para::L_HYPHENATED != 0), "narrow measure should hyphenate");
    // Logical ranges partition the text.
    assert_eq!(lay.lines[0].start, 0);
    for w in lay.lines.windows(2) {
        assert_eq!(w[0].end, w[1].start);
    }
    assert_eq!(lay.lines.last().unwrap().end as usize, u(PARA).len());
}

#[test]
fn total_fit_has_lower_badness_than_first_fit() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let kp = justified(&s, f, 200.0, 0, 0.0);
    let ff = justified(&s, f, 200.0, 1, 0.0);
    assert!(kp.badness <= ff.badness, "kp {} vs ff {}", kp.badness, ff.badness);
}

#[test]
fn optical_margins_hang_punctuation() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let t = u("\u{201C}Quoted lines hang their punctuation into the margin, as the hz-program did. Commas, too, and full stops.\u{201D}");
    let mut run = RunStyle::simple(0, t.len(), f, 14.0);
    run.hyph = Some(0);
    let p = ParaParams { align: para::A_JUSTIFY, widths: vec![180.0], oma: 1.0, ..Default::default() };
    let lay = para::layout(&s, &hyphs(), &t, &[run], &p);
    assert!(lay.lines[0].x < -0.5, "opening quote should hang left, x = {}", lay.lines[0].x);
    let hung_right = lay.lines[..lay.lines.len() - 1].iter().any(|l| l.x + l.width > 180.5);
    assert!(hung_right, "some line ending in punctuation should hang right");
}

#[test]
fn bidi_mixed_line_orders_runs() {
    let mut s = FontStore::default();
    let Some(lat) = inst(&mut s, "Inter[opsz,wght].ttf", &[]) else { return };
    let Some(heb) = inst(&mut s, "NotoSansHebrew[wdth,wght].ttf", &[]) else { return };
    let t = u("Read \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{05E2}\u{05D5}\u{05DC}\u{05DD} now");
    let mut run = RunStyle::simple(0, t.len(), lat, 20.0);
    run.fonts.push(heb);
    let p = ParaParams { align: para::A_START, widths: vec![1000.0], ..Default::default() };
    let lay = para::layout(&s, &HashMap::new(), &t, &[run], &p);
    assert!(lay.missing.is_empty(), "fallback should cover Hebrew: {:?}", lay.missing);
    let l = &lay.lines[0];
    let rtl_runs: Vec<_> = l.runs.iter().filter(|r| r.level % 2 == 1).collect();
    assert!(!rtl_runs.is_empty());
    assert!(rtl_runs.iter().all(|r| r.font == heb || r.glyphs.iter().all(|g| g.flags & shape::G_SPACE != 0)));
    // In the RTL run the first logical letter (shin, offset 5) is right of the last (mem, offset 8).
    let x_of = |off: u32| l.spans.iter().find(|sp| sp.start == off).map(|sp| sp.x0).unwrap();
    assert!(x_of(5) > x_of(8));
    // The second Hebrew word sits LEFT of the first (visual reordering of the embedded run).
    assert!(x_of(10) < x_of(5));
    assert!(x_of(16) > x_of(5)); // "now" after both
}

#[test]
fn small_caps_native_or_synthetic() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    assert!(s.inst(f).unwrap().has_gsub(b"smcp"));
    let t = u("Small");
    let mut r = RunStyle::simple(0, 5, f, 20.0);
    let plain = shape::shape_run(&s, &t, 0, 5, &r, false, *b"Latn");
    r.flags |= shape::R_SMALLCAPS;
    let sc = shape::shape_run(&s, &t, 0, 5, &r, false, *b"Latn");
    assert_ne!(plain[1].gid, sc[1].gid, "m → small-cap m");
    assert_eq!(plain[0].gid, sc[0].gid, "capital S unchanged");
}

#[test]
fn outlines_and_tabs() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "Inter[opsz,wght].ttf", &[]) else { return };
    let mut w = plajah_text::io::Writer::default();
    let g = s.inst(f).unwrap().glyph('O').unwrap();
    plajah_text::fonts::write_outline(s.inst(f).unwrap(), g, &mut w);
    assert!(w.w[1] > 4, "O has curves");
    // Right tab with dot leader.
    let t = u("Chapter One\t12");
    let p = ParaParams { align: para::A_START, widths: vec![300.0], tabs: vec![para::TabStop { pos: 300.0, kind: 1, leader: '.' as u32, align_char: '.' as u32 }], ..Default::default() };
    let lay = para::layout(&s, &HashMap::new(), &t, &[RunStyle::simple(0, t.len(), f, 12.0)], &p);
    let l = &lay.lines[0];
    assert!((l.x + l.width - 300.0).abs() < 0.5, "right tab aligns '12' to 300, got {}", l.x + l.width);
    assert!(l.runs.iter().any(|r| r.flags & shape::G_LEADER != 0 && r.glyphs.len() > 10));
}

#[test]
fn hyphenation_pass_is_feasible() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let t = u(PARA);
    let mut run = RunStyle::simple(0, t.len(), f, 11.0);
    run.hyph = Some(0);
    let mut p = ParaParams { align: para::A_JUSTIFY, widths: vec![190.0], ..Default::default() };
    p.kp.pretolerance = -1.0;
    let lay = para::layout(&s, &hyphs(), &t, &[run], &p);
    for l in &lay.lines { eprintln!("{:6.2} {:2} {:7.2} {}", l.ratio, l.flags, l.natural, String::from_utf16_lossy(&t[l.start as usize..l.end as usize])); }
    assert!(lay.algo <= 2, "total-fit, not the first-fit fallback");
    assert!(lay.lines.iter().all(|l| l.ratio >= -1.0));
}

#[test]
#[ignore]
fn bench_breakdown() {
    let mut s = FontStore::default();
    let Some(f) = inst(&mut s, "EBGaramond[wght].ttf", &[]) else { return };
    let t = u(PARA);
    let h = hyphs();
    let mut run = RunStyle::simple(0, t.len(), f, 11.0);
    run.hyph = Some(0);
    let p = ParaParams { align: para::A_JUSTIFY, widths: vec![280.0], ..Default::default() };
    let n = 300;
    let t0 = std::time::Instant::now();
    for _ in 0..n { std::hint::black_box(shape::shape_run(&s, &t, 0, t.len(), &run, false, *b"Latn")); }
    let shape_ms = t0.elapsed().as_secs_f64() * 1000.0 / n as f64;
    let t0 = std::time::Instant::now();
    for _ in 0..n { std::hint::black_box(plajah_text::itemize::break_opportunities(&t)); }
    let brk_ms = t0.elapsed().as_secs_f64() * 1000.0 / n as f64;
    let t0 = std::time::Instant::now();
    for _ in 0..n { std::hint::black_box(para::layout(&s, &h, &t, &[run.clone()], &p)); }
    let lay_ms = t0.elapsed().as_secs_f64() * 1000.0 / n as f64;
    let mut run2 = run.clone(); run2.hyph = None;
    let t0 = std::time::Instant::now();
    for _ in 0..n { std::hint::black_box(para::layout(&s, &h, &t, &[run2.clone()], &p)); }
    let nohy = t0.elapsed().as_secs_f64() * 1000.0 / n as f64;
    eprintln!("per paragraph ({} chars): shape {shape_ms:.3} ms, uax14 {brk_ms:.3} ms, layout {lay_ms:.3} ms, layout w/o hyph {nohy:.3} ms", t.len());
}
