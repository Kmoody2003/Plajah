//! Threads must only change the speed: the mix has to match a serial render bit for bit.
use plajah_audio::*;
use plajah_audio_host::*;

fn tracks(n: usize) -> Vec<Track> {
    (0..n)
        .map(|t| {
            let mut track = Track::new(48000.0);
            let e = track.engine().cast();
            unsafe {
                pa_set_param(e, 1704, if t % 2 == 0 { 1.0 } else { 0.0 });
                for v in 0..6 {
                    pa_note_on(e, 36.0 + (t * 3 + v * 7) as f32, 0.8, v as u32 + 1, (v * 11) as u32);
                }
            }
            track
        })
        .collect()
}

fn run(threads: usize) -> Vec<f32> {
    let mut pool = RenderPool::new(threads);
    let mut ts = tracks(12);
    let (mut l, mut r) = ([0.0; BLOCK], [0.0; BLOCK]);
    let mut out = vec![];
    for block in 0..1500 {
        // Notes between blocks, the way the bridge will send them.
        if block % 200 == 100 {
            for (i, t) in ts.iter_mut().enumerate() {
                unsafe { pa_note_off(t.engine().cast(), (i % 6) as u32 + 1) };
            }
        }
        pool.render(&mut ts, &mut l, &mut r);
        out.extend_from_slice(&l);
        out.extend_from_slice(&r);
    }
    out
}

#[test]
fn every_thread_count_matches_serial() {
    let serial = run(1);
    assert!(serial.iter().any(|s| s.abs() > 1e-3), "serial render is silent");
    for threads in [2, 3, 8, 16, 32] {
        let got = run(threads);
        let bad = serial.iter().zip(&got).filter(|(a, b)| a.to_bits() != b.to_bits()).count();
        assert_eq!(bad, 0, "{threads} threads: {bad} samples differ");
    }
}

#[test]
fn pool_starts_and_stops_with_no_tracks() {
    let mut pool = RenderPool::new(4);
    let (mut l, mut r) = ([1.0; BLOCK], [1.0; BLOCK]);
    pool.render(&mut [], &mut l, &mut r);
    assert!(l.iter().chain(&r).all(|s| *s == 0.0));
}
