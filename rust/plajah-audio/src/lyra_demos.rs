//! Listening demos for LYRA through the whole engine (voices → LYRA rack → Veil → output stage),
//! written as WAVs: `cargo test --release lyra_demos -- --ignored` → scratch/lyra-demos/*.wav.

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
    e.params.set(LYRA_BASE + LY_ENABLE, 1.0);
    e.params.set(VEIL_BASE + V_MIX, 0.14);
    e.params.set(VEIL_BASE + V_SIZE, 0.55);
    e.params.set(VEIL_BASE + V_DECAY, 0.4);
    for &(id, v) in set {
        e.params.set(LYRA_BASE + id, v);
    }
    let end = notes.iter().map(|n| n.0 + n.3).fold(0.0f32, f32::max) + 2.5;
    let total = (end * sr) as usize;
    let mut evs: Vec<(usize, bool, f32, f32, u32)> = Vec::new();
    for (i, &(t, m, v, len)) in notes.iter().enumerate() {
        evs.push(((t * sr) as usize, true, m, v, i as u32 + 1));
        evs.push((((t + len) * sr) as usize, false, m, v, i as u32 + 1));
    }
    evs.sort_by_key(|x| (x.0, x.1));
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
    let g = (0.89 / peak).min(4.0);
    for x in l.iter_mut().chain(r.iter_mut()) {
        *x *= g;
    }
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scratch/lyra-demos");
    std::fs::create_dir_all(&dir).unwrap();
    write_wav(&dir.join(format!("{name}.wav")), &l, &r, sr as u32);
    eprintln!("{name}: {end:.1}s, engine peak {peak:.3}");
}

fn strum(t: f32, chord: &[f32], vel: f32, len: f32, up: bool, out: &mut Vec<Note>) {
    let n = chord.len();
    for i in 0..n {
        let j = if up { n - 1 - i } else { i };
        out.push((t + i as f32 * 0.014, chord[j], vel * (0.85 + 0.15 * (i as f32 / n as f32)), len));
    }
}

fn line(mel: &[(f32, f32)], vel: f32, gap: f32) -> Vec<Note> {
    let mut t = 0.0;
    let mut n = Vec::new();
    for &(m, len) in mel {
        n.push((t, m, vel, (len + gap).max(0.05)));
        t += len;
    }
    n
}

#[test]
#[ignore]
fn render_demos() {
    // Guitar, steel: G – C – D – G, down / down-up strums.
    let (g, c, d) = ([43.0, 47.0, 50.0, 55.0, 59.0, 67.0], [48.0, 52.0, 55.0, 60.0, 64.0], [50.0, 57.0, 62.0, 66.0]);
    let mut n = Vec::new();
    for (bar, ch) in [&g[..], &c[..], &d[..], &g[..]].iter().enumerate() {
        let t = bar as f32 * 2.0;
        strum(t, ch, 0.85, 0.95, false, &mut n);
        strum(t + 1.0, ch, 0.7, 0.45, false, &mut n);
        strum(t + 1.5, ch, 0.55, 0.45, true, &mut n);
    }
    play("guitar_steel_strum", &[(LY_MODEL, 0.0), (LY_VARIANT, 0.0)], &n);

    let arp = [48.0, 55.0, 64.0, 67.0, 71.0, 67.0, 64.0, 55.0, 45.0, 52.0, 60.0, 64.0, 67.0, 64.0, 60.0, 52.0];
    let n: Vec<Note> = arp.iter().enumerate().map(|(i, &m)| (i as f32 * 0.3, m, 0.7, 1.2)).collect();
    play("guitar_nylon_arpeggio", &[(LY_MODEL, 0.0), (LY_VARIANT, 1.0), (LY_EXCITE_HARD, 0.35)], &n);

    let mut n = Vec::new();
    for (i, root) in [40.0f32, 40.0, 43.0, 45.0].iter().enumerate() {
        for k in 0..4 {
            let t = i as f32 * 1.2 + k as f32 * 0.3;
            for iv in [0.0, 7.0, 12.0] {
                n.push((t + iv * 0.0008, root + iv, if k == 0 { 0.95 } else { 0.7 }, 0.26));
            }
        }
    }
    play("guitar_electric_crunch", &[(LY_MODEL, 0.0), (LY_VARIANT, 2.0), (LY_DRIVE, 0.8), (LY_DAMP, 0.25), (LY_TONE, 0.6)], &n);

    // Piano: C – Am – F – G under a melody.
    let mut n = Vec::new();
    for (i, ch) in [[48.0, 55.0, 64.0], [45.0, 52.0, 60.0], [41.0, 48.0, 57.0], [43.0, 50.0, 59.0]].iter().enumerate() {
        for &m in ch {
            n.push((i as f32 * 1.6, m, 0.6, 1.55));
        }
    }
    for (i, &m) in [72.0, 76.0, 74.0, 72.0, 69.0, 72.0, 71.0, 67.0].iter().enumerate() {
        n.push((i as f32 * 0.8, m, 0.78, 0.75));
    }
    play("piano_grand", &[(LY_MODEL, 1.0), (LY_VARIANT, 0.0), (LY_DECAY, 0.6)], &n);

    let n = line(&[(67.0, 0.6), (69.0, 0.3), (71.0, 0.9), (74.0, 0.6), (72.0, 0.6), (71.0, 0.6), (69.0, 1.2), (67.0, 1.6)], 0.8, 0.03);
    play("violin_concert", &[(LY_MODEL, 2.0), (LY_VIB_DEPTH, 0.45), (LY_EXCITE_POS, 0.35)], &n);

    let n = line(&[(63.0, 0.3), (65.0, 0.3), (66.0, 0.15), (67.0, 0.75), (70.0, 0.45), (67.0, 0.3), (65.0, 0.3), (63.0, 1.2)], 0.8, -0.02);
    play("sax_alto_blues", &[(LY_MODEL, 3.0), (LY_VARIANT, 0.0), (LY_VIB_DEPTH, 0.3)], &n);
    play("sax_tenor_ballad", &[(LY_MODEL, 3.0), (LY_VARIANT, 1.0), (LY_VIB_DEPTH, 0.4), (LY_NOISE, 0.6), (LY_EXCITE_HARD, 0.3)], &n.iter().map(|x| (x.0 * 1.6, x.1 - 5.0, 0.6, x.3 * 1.6)).collect::<Vec<_>>());

    let n = line(&[(60.0, 0.25), (64.0, 0.25), (67.0, 0.25), (72.0, 0.9), (67.0, 0.25), (72.0, 1.4)], 0.9, -0.03);
    play("trumpet_open_fanfare", &[(LY_MODEL, 4.0), (LY_VARIANT, 0.0)], &n);
    let n = line(&[(67.0, 0.9), (70.0, 0.45), (72.0, 0.45), (74.0, 1.5), (72.0, 0.6), (70.0, 1.8)], 0.6, -0.03);
    play("trumpet_harmon_ballad", &[(LY_MODEL, 4.0), (LY_VARIANT, 2.0), (LY_VIB_DEPTH, 0.12)], &n);

    // Legato (notes overlap → slurs) vs tongued, and the woodwinds.
    let blues = [(63.0, 0.3), (65.0, 0.3), (66.0, 0.15), (67.0, 0.75), (70.0, 0.45), (67.0, 0.3), (65.0, 0.3), (63.0, 1.2)];
    play("sax_alto_slurred", &[(LY_MODEL, 3.0), (LY_VARIANT, 0.0), (LY_VIB_DEPTH, 0.3)], &line(&blues, 0.8, 0.05));
    let swell: Vec<Note> = (0..6).map(|i| (i as f32 * 0.9, 62.0, 0.15 + i as f32 * 0.17, 0.8)).collect();
    play("sax_alto_pp_to_ff", &[(LY_MODEL, 3.0), (LY_VARIANT, 0.0)], &swell);
    play("trumpet_pp_to_ff", &[(LY_MODEL, 4.0), (LY_VARIANT, 0.0)], &swell.iter().map(|x| (x.0, 67.0, x.2, x.3)).collect::<Vec<_>>());
    let lyr = [(74.0, 0.45), (76.0, 0.45), (79.0, 0.9), (81.0, 0.45), (79.0, 0.45), (76.0, 0.9), (74.0, 1.6)];
    play("flute_concert", &[(LY_MODEL, 6.0), (LY_VARIANT, 0.0), (LY_VIB_DEPTH, 0.35)], &line(&lyr, 0.7, 0.04));
    let jig = [(74.0, 0.2), (76.0, 0.2), (78.0, 0.2), (79.0, 0.4), (78.0, 0.2), (76.0, 0.2), (74.0, 0.4), (71.0, 0.2), (74.0, 0.6)];
    play("tin_whistle_jig", &[(LY_MODEL, 6.0), (LY_VARIANT, 3.0), (LY_VIB_DEPTH, 0.08), (LY_NOISE, 0.6)], &line(&jig, 0.8, -0.03));
    let low = [(52.0, 0.6), (55.0, 0.6), (59.0, 0.6), (57.0, 0.9), (55.0, 0.6), (52.0, 1.5)];
    play("clarinet_chalumeau", &[(LY_MODEL, 7.0), (LY_VARIANT, 0.0)], &line(&low, 0.6, 0.04));
    let kl = [(67.0, 0.3), (68.0, 0.3), (71.0, 0.6), (72.0, 0.3), (71.0, 0.3), (68.0, 0.3), (67.0, 1.2)];
    play("clarinet_klezmer", &[(LY_MODEL, 7.0), (LY_VARIANT, 0.0), (LY_VIB_DEPTH, 0.4), (LY_VIB_RATE, 0.7), (LY_EXCITE_HARD, 0.75)], &line(&kl, 0.85, 0.03));
    let ob = [(69.0, 0.9), (72.0, 0.45), (71.0, 0.45), (69.0, 0.9), (67.0, 0.45), (69.0, 1.6)];
    play("oboe", &[(LY_MODEL, 8.0), (LY_VARIANT, 0.0), (LY_VIB_DEPTH, 0.3)], &line(&ob, 0.7, 0.04));
    play("bassoon", &[(LY_MODEL, 8.0), (LY_VARIANT, 2.0), (LY_VIB_DEPTH, 0.18)], &line(&ob.iter().map(|x| (x.0 - 24.0, x.1)).collect::<Vec<_>>(), 0.75, 0.04));
    // A woodwind section chord (notes together stay voices).
    let mut n = Vec::new();
    for (i, ch) in [[72.0, 76.0, 79.0], [72.0, 77.0, 81.0], [71.0, 74.0, 79.0], [72.0, 76.0, 79.0]].iter().enumerate() {
        for &m in ch { n.push((i as f32 * 1.0, m, 0.6, 0.97)); }
    }
    play("reed_choir_clarinets", &[(LY_MODEL, 7.0), (LY_VARIANT, 0.0)], &n);

    // Tine piano: Fmaj7 – Em7 – Dm7 – Cmaj7, through the suitcase, then voiced for bark.
    let mut n = Vec::new();
    for (i, ch) in [[53.0, 57.0, 60.0, 64.0], [52.0, 55.0, 59.0, 62.0], [50.0, 53.0, 57.0, 60.0], [48.0, 52.0, 55.0, 59.0]].iter().enumerate() {
        for &m in ch {
            n.push((i as f32 * 1.5, m, 0.55 + 0.25 * (i % 2) as f32, 1.45));
        }
        n.push((i as f32 * 1.5 + 0.75, ch[3] + 12.0, 0.85, 0.7));
    }
    play("tine_suitcase", &[(LY_MODEL, 5.0), (LY_TREM_DEPTH, 0.5), (LY_DRIVE, 0.2), (LY_EXCITE_POS, 0.45)], &n);
    let hard: Vec<Note> = n.iter().map(|x| (x.0, x.1, (x.2 + 0.3).min(1.0), x.3)).collect();
    play("tine_bark", &[(LY_MODEL, 5.0), (LY_EXCITE_POS, 0.85), (LY_DRIVE, 0.55), (LY_EXCITE_HARD, 0.7)], &hard);
}
