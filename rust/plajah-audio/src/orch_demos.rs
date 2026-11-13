//! Listening demos for ARCO and CORNU through the whole engine (voices → deep-body rack → Veil →
//! output), written as WAVs: `cargo test --release orch_demos -- --ignored` →
//! artifacts/orch-demos/*.wav (gitignored).

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
    let sr = 48000.0f32;
    let mut e = Engine::new(sr);
    e.params.set(VEIL_BASE + V_MIX, 0.18);
    e.params.set(VEIL_BASE + V_SIZE, 0.6);
    e.params.set(VEIL_BASE + V_DECAY, 0.4);
    for &(id, v) in set {
        e.set_param(id, v);
    }
    let end = notes.iter().map(|n| n.0 + n.3).fold(0.0f32, f32::max) + 2.5;
    let total = (end * sr) as usize;
    let mut evs: Vec<(usize, bool, f32, f32, u32)> = Vec::new();
    for (i, &(t, m, v, len)) in notes.iter().enumerate() {
        evs.push(((t * sr) as usize, true, m, v, i as u32 + 1));
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

#[test]
#[ignore]
fn orch_demos() {
    let a = |id: u32| ARCO_BASE + id;
    let c = |id: u32| CORNU_BASE + id;
    let melody = [(69.0, 0.5), (71.0, 0.5), (73.0, 0.5), (76.0, 1.0), (74.0, 0.5), (73.0, 0.5), (71.0, 0.5), (69.0, 1.5)];
    // ── ARCO ──
    play("arco_01_solo_violin", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_DEEP), 0.5)], &line(0.2, &melody, 0.75));
    let cello = [(48.0, 0.8), (55.0, 0.8), (57.0, 0.8), (52.0, 1.2), (53.0, 0.8), (50.0, 0.8), (48.0, 2.0)];
    play("arco_02_solo_cello", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 2.0), (a(AR_DEEP), 0.5)], &line(0.2, &cello, 0.7));
    play("arco_03_violin_section_12", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_SECTION), 7.0), (a(AR_DEEP), 0.5)], &line(0.2, &melody, 0.7));
    let prog: [&[f32]; 4] = [&[48.0, 64.0, 67.0, 76.0], &[45.0, 64.0, 69.0, 72.0], &[41.0, 65.0, 69.0, 72.0], &[43.0, 62.0, 67.0, 71.0]];
    play("arco_04_string_quartet", &[(a(AR_ENABLE), 1.0), (a(AR_ENSEMBLE), 1.0), (a(AR_DEEP), 0.5)], &chords(0.2, &prog, 1.8, 0.65));
    play("arco_05_full_string_orchestra", &[(a(AR_ENABLE), 1.0), (a(AR_ENSEMBLE), 4.0), (a(AR_BASS_OCTAVE), 1.0), (a(AR_DEEP), 0.5)], &chords(0.2, &prog, 2.2, 0.7));
    let arp: Vec<Note> = [57.0, 60.0, 64.0, 69.0, 64.0, 60.0, 57.0, 52.0].iter().enumerate().map(|(i, &m)| (0.2 + i as f32 * 0.3, m, 0.7, 0.25)).collect();
    play("arco_06_pizzicato_section", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 0.0), (a(AR_SECTION), 5.0), (a(AR_ARTIC), 3.0), (a(AR_DEEP), 0.5)], &arp);
    play("arco_07_spiccato_violas", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 1.0), (a(AR_SECTION), 4.0), (a(AR_ARTIC), 2.0), (a(AR_DEEP), 0.5)],
        &[57.0, 57.0, 60.0, 60.0, 64.0, 64.0, 60.0, 57.0].iter().enumerate().map(|(i, &m)| (0.2 + i as f32 * 0.2, m, 0.7, 0.15)).collect::<Vec<_>>());
    play("arco_08_tremolo_cellos", &[(a(AR_ENABLE), 1.0), (a(AR_INSTRUMENT), 2.0), (a(AR_SECTION), 5.0), (a(AR_ARTIC), 5.0), (a(AR_DEEP), 0.5)], &[(0.2, 43.0, 0.7, 3.0), (0.2, 50.0, 0.7, 3.0)]);
    // ── CORNU ──
    let fanfare = [(60.0, 0.3), (65.0, 0.3), (69.0, 0.3), (72.0, 0.9), (69.0, 0.3), (72.0, 1.4)];
    play("cornu_01_trumpet", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 0.0)], &line(0.2, &fanfare, 0.8));
    let horn = [(53.0, 0.7), (60.0, 0.7), (65.0, 1.0), (64.0, 0.5), (62.0, 0.5), (60.0, 1.6)];
    play("cornu_02_french_horn", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 5.0)], &line(0.2, &horn, 0.65));
    let tbn = [(46.0, 0.6), (50.0, 0.6), (53.0, 0.6), (58.0, 1.2), (53.0, 0.6), (46.0, 1.6)];
    play("cornu_03_trombone_slide", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 6.0), (c(CN_PORTAMENTO), 0.5)], &line(0.2, &tbn, 0.7));
    let bq: [&[f32]; 3] = [&[41.0, 53.0, 60.0, 65.0, 69.0], &[43.0, 55.0, 62.0, 67.0, 71.0], &[36.0, 52.0, 60.0, 67.0, 72.0]];
    play("cornu_04_brass_quintet", &[(c(CN_ENABLE), 1.0), (c(CN_ENSEMBLE), 1.0)], &chords(0.2, &bq, 1.8, 0.7));
    play("cornu_05_tuba", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 9.0)], &line(0.2, &[(36.0, 0.6), (43.0, 0.6), (41.0, 0.6), (36.0, 1.5)], 0.75));
    play("cornu_06_muted_trumpet_harmon", &[(c(CN_ENABLE), 1.0), (c(CN_INSTRUMENT), 0.0), (c(CN_MUTE), 3.0)], &line(0.2, &fanfare, 0.6));
}
