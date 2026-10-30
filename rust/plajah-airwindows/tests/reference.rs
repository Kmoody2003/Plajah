// Every port against the ORIGINAL C++ (ref/bin/ref_<Name>.exe, built by ref/build.ps1): same
// input, same 128-frame blocks, same dither seeds, several parameter sets and sample rates.
// Skips (loudly) when the reference binaries are not built.
//
//   cargo test -p plajah-airwindows --test reference -- --nocapture
//   AW_ONLY=Galactic cargo test ...      # one plugin

use plajah_airwindows::plugins::{create, KINDS};
use std::path::PathBuf;
use std::process::Command;

const SEED_L: u32 = 2_463_534_242;
const SEED_R: u32 = 88_675_123;
const BLOCK: usize = 128;
/// Outputs are f32 casts of f64 math; a faithful port agrees to rounding. Anything past this is
/// a transliteration mistake, not libm noise.
const TOL: f32 = 2e-5;

fn ref_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ref").join("bin") }

/// Deterministic parameter sets: constructor defaults (None), the corners, the middle, and two
/// scattered sets from a fixed LCG.
fn param_sets(n: usize) -> Vec<Option<Vec<f32>>> {
    let mut sets = vec![None, Some(vec![0.0; n]), Some(vec![1.0; n]), Some(vec![0.5; n])];
    let mut lcg: u32 = 0xC0FFEE;
    for _ in 0..2 {
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            lcg = lcg.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            v.push(((lcg >> 8) as f32 / 16_777_216.0 * 1000.0).round() / 1000.0);
        }
        sets.push(Some(v));
    }
    sets
}

fn run_case(name: &str, kind: u32, sr: f64, params: &Option<Vec<f32>>) -> Result<(f32, usize), String> {
    let exe = ref_dir().join(format!("ref_{name}.exe"));
    let out = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(format!("aw_{name}_{}.f32", sr as u32));
    let frames = (sr * 1.5) as usize;
    let mut cmd = Command::new(&exe);
    cmd.arg(format!("{sr}")).arg(frames.to_string()).arg(&out).arg(SEED_L.to_string()).arg(SEED_R.to_string());
    if let Some(p) = params { for v in p { cmd.arg(format!("{v}")); } }
    let st = cmd.status().map_err(|e| format!("run {exe:?}: {e}"))?;
    if !st.success() { return Err(format!("{exe:?} exited {st}")); }
    let bytes = std::fs::read(&out).map_err(|e| e.to_string())?;
    let f: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    assert_eq!(f.len(), frames * 4);

    let mut l: Vec<f32> = (0..frames).map(|i| f[i * 4]).collect();
    let mut r: Vec<f32> = (0..frames).map(|i| f[i * 4 + 1]).collect();
    let mut fx = create(kind, sr, SEED_L, SEED_R).ok_or("unknown kind")?;
    fx.seeds(SEED_L, SEED_R);
    if let Some(p) = params { for (i, v) in p.iter().enumerate() { fx.set_param(i, *v); } }
    for off in (0..frames).step_by(BLOCK) {
        let end = (off + BLOCK).min(frames);
        fx.process(&mut l[off..end], &mut r[off..end]);
    }
    let mut worst = 0f32;
    let mut at = 0usize;
    for i in 0..frames {
        for (got, want) in [(l[i], f[i * 4 + 2]), (r[i], f[i * 4 + 3])] {
            let d = if want.is_nan() && got.is_nan() { 0.0 } else { (got - want).abs() };
            let d = if d.is_nan() { f32::INFINITY } else { d };
            if d > worst { worst = d; at = i; }
        }
    }
    Ok((worst, at))
}

#[test]
fn ports_match_original_cpp() {
    if !ref_dir().exists() {
        eprintln!("SKIP: no reference binaries — run powershell -File rust/plajah-airwindows/ref/build.ps1");
        return;
    }
    let only = std::env::var("AW_ONLY").ok();
    let mut failures = Vec::new();
    for &(kind, name, nparams) in KINDS {
        if only.as_deref().is_some_and(|o| !o.split(',').any(|x| x == name)) { continue; }
        if !ref_dir().join(format!("ref_{name}.exe")).exists() { eprintln!("SKIP {name}: no ref exe"); continue; }
        let mut worst_all = 0f32;
        for sr in [44100.0, 48000.0, 96000.0] {
            for (si, set) in param_sets(nparams).iter().enumerate() {
                match run_case(name, kind, sr, set) {
                    Ok((worst, at)) => {
                        worst_all = worst_all.max(worst);
                        if worst > TOL { failures.push(format!("{name} sr={sr} set#{si} {set:?}: max diff {worst:e} at frame {at}")); }
                    }
                    Err(e) => failures.push(format!("{name}: {e}")),
                }
            }
        }
        eprintln!("{name:16} worst diff {worst_all:e}");
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
