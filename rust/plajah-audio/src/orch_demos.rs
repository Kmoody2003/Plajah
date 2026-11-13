//! Listening demos for ARCO and CORNU through the whole engine (voices → deep-body rack → output),
//! played the way a musician plays a keyboard with a mod wheel: phrases with dynamics curves on
//! CC1, shaped velocities and human timing. Rendered dry (close-miked);
//! `cargo test --release orch_demos -- --ignored` → artifacts/orch-demos/*.wav (gitignored).

use crate::engine::Engine;
use crate::params::*;

type Note = (f32, f32, f32, f32); // start s, midi, velocity, length s

fn write_wav(path: &std::path::Path, l: &[f32], r: &[f32], sr: u32) {
    let n = l.len();
    let data = (n * 4) as u32;
    let mut b: Vec<u8> = Vec::with_capacity(44 + n * 4);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&sr.to_le_bytes());
    b.extend_from_slice(&(sr * 4).to_le_bytes());
    b.extend_from_slice(&4u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data.to_le_bytes());
    for i in 0..n {
        for x in [l[i], r[i]] {
            b.extend_from_slice(&((x.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
    }
    std::fs::write(path, b).unwrap();
}

fn play(name: &str, set: &[(u32, f32)], notes: &[Note]) {
    play_cc(name, set, notes, None);
}

/// A phrase as a player would play it: notes, an optional dynamics curve on CC1 (seconds →
/// 0..1), and human timing and touch.
fn play_cc(name: &str, set: &[(u32, f32)], notes: &[Note], cc1: Option<&dyn Fn(f32) -> f32>) {
    let sr = 48000.0f32;
    let mut e = Engine::new(sr);
    e.params.set(VEIL_BASE + V_MIX, 0.0);
    for &(id, v) in set {
        e.set_param(id, v);
    }
    let mut seed = 0x1234_5678u32 ^ (name.len() as u32).wrapping_mul(7919);
    let mut rnd = move || {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        (seed >> 8) as f32 / 16777216.0 * 2.0 - 1.0
    };
    let notes: Vec<Note> = notes.iter().map(|&(t, m, v, len)| (t + rnd() * 0.008, m, (v + rnd() * 0.05).clamp(0.05, 1.0), len * (1.0 + rnd() * 0.03))).collect();
    let end = notes.iter().map(|n| n.0 + n.3).fold(0.0f32, f32::max) + 2.0;
    let total = (end * sr) as usize;
    let mut evs: Vec<(usize, bool, f32, f32, u32)> = Vec::new();
    for (i, &(t, m, v, len)) in notes.iter().enumerate() {
        evs.push(((t.max(0.0) * sr) as usize, true, m, v, i as u32 + 1));
        evs.push((((t + len) * sr) as usize, false, m, v, i as u32 + 1));
    }
    evs.sort_by_key(|x| (x.0, !x.1));
    let (mut l, mut r) = (Vec::with_capacity(total), Vec::with_capacity(total));
    let (mut k, mut pos) = (0, 0);
    while pos < total {
        let block = 128.min(total - pos);
        while k < evs.len() && evs[k].0 < pos + block {
            let (at, on, m, v, id) = evs[k];
            if on {
                e.note_on(m, v, id, at.saturating_sub(pos) as u32);
            } else {
                e.note_off(id);
            }
            k += 1;
        }
        if let Some(f) = cc1 {
            e.set_mod_wheel(f(pos as f32 / sr));
        }
        e.render(block);
        let (pl, pr) = (e.scratch_ptr(0), e.scratch_ptr(1));
        for i in 0..block {
            // SAFETY: scratch holds at least MAX_BLOCK frames per channel; block ≤ 128.
            unsafe {
                l.push(*pl.add(i));
                r.push(*pr.add(i));
            }
        }
        pos += block;
    }
    let peak = l.iter().chain(r.iter()).fold(0.0f32, |a, b| a.max(b.abs())).max(1e-6);
    assert!(l.iter().all(|x| x.is_finite()), "{name}: not finite");
    let g = (0.89 / peak).min(8.0);
    for x in l.iter_mut().chain(r.iter_mut()) {
        *x *= g;
    }
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../artifacts/orch-demos");
    std::fs::create_dir_all(&dir).unwrap();
    write_wav(&dir.join(format!("{name}.wav")), &l, &r, sr as u32);
    eprintln!("{name}: {end:.1}s, engine peak {peak:.4}");
}

/// A legato line: each note overlaps the next by 60 ms so the engine slurs.
fn line(start: f32, notes: &[(f32, f32)], vel: f32) -> Vec<Note> {
    let mut t = start;
    notes
        .iter()
        .map(|&(m, d)| {
            let n = (t, m, vel, d + 0.06);
            t += d;
            n
        })
        .collect()
}

fn chords(start: f32, cs: &[&[f32]], dur: f32, vel: f32) -> Vec<Note> {
    let mut out = Vec::new();
    for (i, c) in cs.iter().enumerate() {
        for &m in c.iter() {
            out.push((start + i as f32 * dur, m, vel, dur * 0.97));
        }
    }
    out
}

/// A dynamics arc over [t0, t1]: from `a` up to `peak` at `at` (0..1 of the span), down to `b`.
fn arc(t: f32, t0: f32, t1: f32, a: f32, peak: f32, at: f32, b: f32) -> f32 {
    let x = ((t - t0) / (t1 - t0)).clamp(0.0, 1.0);
    if x < at {
        let u = x / at;
        a + (peak - a) * (u * u * (3.0 - 2.0 * u))
    } else {
        let u = (x - at) / (1.0 - at);
        peak + (b - peak) * (u * u * (3.0 - 2.0 * u))
    }
}

fn last_end(n: &[Note]) -> f32 {
    n.last().map(|x| x.0 + x.3).unwrap_or(10.0)
}

#[test]
#[ignore]
fn orch_demos() {
    let a = |id: u32| ARCO_BASE + id;
    let c = |id: u32| CORNU_BASE + id;
    // ── ARCO ── a lyrical line: the bow follows the mod wheel, legato.
    let song = [(67.0, 0.9), (72.0, 0.6), (74.0, 0.3), (76.0, 1.4), (74.0, 0.45), (72.0, 0.45), (71.0, 0.9), (72.0, 0.9), (74.0, 1.8),
        (76.0, 0.6), (77.0, 0.6), (79.0, 1.2), (76.0, 0.6), (72.0, 0.6), (74.0, 2.4)];
    let vln = line(0.3, &song, 0.6);
    let e1 = last_end(&vln);
    let swell = move |t: f32| if t < 6.5 { arc(t, 0.3, 6.5, 0.3, 0.75, 0.55, 0.45) } else { arc(t, 6.5, e1, 0.45, 0.9, 0.45, 0.25) };
    play_cc("arco_01_solo_violin", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_DEEP), 0.5), (a(AR_MOD_DYN), 1.0)], &vln, Some(&swell));
    let cello_song = [(48.0, 1.2), (55.0, 0.6), (57.0, 0.6), (60.0, 1.8), (59.0, 0.6), (57.0, 0.6), (55.0, 1.2), (53.0, 0.6), (52.0, 0.6), (50.0, 0.9), (48.0, 2.4)];
    let vc = line(0.3, &cello_song, 0.6);
    let e2 = last_end(&vc);
    let swell_c = move |t: f32| arc(t, 0.3, e2, 0.35, 0.85, 0.4, 0.2);
    play_cc("arco_02_solo_cello", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 2.0), (a(AR_DEEP), 0.5), (a(AR_MOD_DYN), 1.0)], &vc, Some(&swell_c));
    play_cc("arco_03_violin_section_12", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_SECTION), 7.0), (a(AR_DEEP), 0.5), (a(AR_MOD_DYN), 1.0)], &vln, Some(&swell));
    let prog: [&[f32]; 6] = [&[48.0, 64.0, 67.0, 76.0], &[45.0, 64.0, 69.0, 72.0], &[41.0, 65.0, 69.0, 72.0], &[43.0, 62.0, 67.0, 71.0], &[45.0, 60.0, 64.0, 72.0], &[43.0, 59.0, 65.0, 74.0]];
    let chord_swell = |t: f32| {
        let ph = ((t - 0.3) / 1.9).rem_euclid(1.0);
        0.3 + 0.45 * (std::f32::consts::PI * ph).sin() + 0.1 * (t / 12.0)
    };
    play_cc("arco_04_string_quartet", &[(a(AR_ENABLE), 1.0), (a(AR_ENSEMBLE), 1.0), (a(AR_DEEP), 0.5), (a(AR_MOD_DYN), 1.0)], &chords(0.3, &prog, 1.9, 0.6), Some(&chord_swell));
    let grand = |t: f32| arc(t, 0.3, 13.0, 0.2, 0.95, 0.75, 0.3);
    play_cc("arco_05_full_string_orchestra", &[(a(AR_ENABLE), 1.0), (a(AR_ENSEMBLE), 4.0), (a(AR_BASS_OCTAVE), 1.0), (a(AR_DEEP), 0.5), (a(AR_MOD_DYN), 1.0)], &chords(0.3, &prog, 2.1, 0.6), Some(&grand));
    let arp: Vec<Note> = [57.0, 60.0, 64.0, 69.0, 72.0, 69.0, 64.0, 60.0, 57.0, 52.0].iter().enumerate().map(|(i, &m)| (0.2 + i as f32 * 0.28, m, 0.5 + 0.3 * ((i as f32) * 0.7).sin().abs(), 0.25)).collect();
    play("arco_06_pizzicato_section", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_SECTION), 5.0), (a(AR_ARTIC), 3.0), (a(AR_DEEP), 0.5)], &arp);
    let spic: Vec<Note> = [57.0, 57.0, 60.0, 60.0, 64.0, 64.0, 60.0, 57.0, 55.0, 57.0].iter().enumerate().map(|(i, &m)| (0.2 + i as f32 * 0.19, m, if i % 2 == 0 { 0.8 } else { 0.55 }, 0.14)).collect();
    play("arco_07_spiccato_violas", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 1.0), (a(AR_SECTION), 4.0), (a(AR_ARTIC), 2.0), (a(AR_DEEP), 0.5)], &spic);
    play("arco_08_tremolo_cellos", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 2.0), (a(AR_SECTION), 5.0), (a(AR_ARTIC), 5.0), (a(AR_DEEP), 0.5)], &[(0.2, 43.0, 0.7, 3.0), (0.2, 50.0, 0.7, 3.0)]);
    // ── CORNU ── a fanfare, tongued, accented where a trumpeter would.
    let fan: Vec<Note> = vec![(0.3, 60.0, 0.75, 0.22), (0.55, 65.0, 0.6, 0.22), (0.8, 69.0, 0.65, 0.22), (1.05, 72.0, 0.9, 0.8), (1.95, 69.0, 0.6, 0.22), (2.2, 72.0, 0.95, 1.4),
        (4.0, 72.0, 0.7, 0.3), (4.35, 74.0, 0.65, 0.3), (4.7, 76.0, 0.8, 0.3), (5.05, 77.0, 0.75, 0.3), (5.4, 79.0, 0.95, 1.6)];
    play("cornu_01_trumpet", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 0.0)], &fan);
    let horn_song = [(53.0, 0.9), (60.0, 0.9), (65.0, 1.4), (64.0, 0.45), (62.0, 0.45), (60.0, 0.9), (65.0, 0.9), (69.0, 1.8), (67.0, 0.6), (65.0, 2.2)];
    let hn = line(0.3, &horn_song, 0.6);
    let e3 = last_end(&hn);
    let hswell = move |t: f32| arc(t, 0.3, e3, 0.35, 0.8, 0.55, 0.25);
    play_cc("cornu_02_french_horn", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 5.0), (c(CN_MOD_DYN), 1.0)], &hn, Some(&hswell));
    let tbn_song = [(46.0, 0.9), (50.0, 0.9), (53.0, 0.9), (58.0, 1.8), (57.0, 0.45), (55.0, 0.45), (53.0, 0.9), (46.0, 2.2)];
    let tb = line(0.3, &tbn_song, 0.6);
    let e4 = last_end(&tb);
    let tswell = move |t: f32| arc(t, 0.3, e4, 0.4, 0.8, 0.5, 0.3);
    play_cc("cornu_03_trombone_slide", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 6.0), (c(CN_PORTAMENTO), 0.35), (c(CN_MOD_DYN), 1.0)], &tb, Some(&tswell));
    let bq: [&[f32]; 4] = [&[41.0, 53.0, 60.0, 65.0, 69.0], &[43.0, 55.0, 62.0, 67.0, 71.0], &[45.0, 57.0, 60.0, 65.0, 72.0], &[36.0, 52.0, 60.0, 67.0, 72.0]];
    let bq_swell = |t: f32| {
        let ph = ((t - 0.3) / 2.0).rem_euclid(1.0);
        0.35 + 0.4 * (std::f32::consts::PI * ph).sin()
    };
    play_cc("cornu_04_brass_quintet", &[(c(CN_ENABLE), 1.0), (c(CN_ENSEMBLE), 1.0), (c(CN_MOD_DYN), 1.0)], &chords(0.3, &bq, 2.0, 0.6), Some(&bq_swell));
    play("cornu_05_tuba", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 9.0)], &[(0.3, 36.0, 0.8, 0.5), (0.9, 43.0, 0.6, 0.5), (1.5, 41.0, 0.65, 0.5), (2.1, 40.0, 0.6, 0.5), (2.7, 36.0, 0.85, 1.6)]);
    play("cornu_06_muted_trumpet_harmon", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 0.0), (c(CN_MUTE), 3.0), (c(CN_VIB_DEPTH), 0.5)], &line(0.3, &[(67.0, 0.6), (70.0, 0.6), (72.0, 1.2), (70.0, 0.4), (67.0, 0.4), (65.0, 1.8)], 0.6));
}
