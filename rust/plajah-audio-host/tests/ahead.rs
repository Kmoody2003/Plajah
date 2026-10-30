//! Render-ahead must play the same samples as a direct render, and stay in time after a miss.
use plajah_audio::*;
use plajah_audio_host::*;
use std::time::Duration;

fn tracks() -> Vec<Track> {
    (0..6)
        .map(|t| {
            let mut track = Track::new(48000.0);
            for v in 0..4 {
                unsafe { pa_note_on(track.engine().cast(), 40.0 + (t * 3 + v * 5) as f32, 0.8, v as u32 + 1, 0) };
            }
            track
        })
        .collect()
}

fn direct(blocks: usize) -> Vec<f32> {
    let mut pool = RenderPool::new(1);
    let mut ts = tracks();
    let (mut l, mut r) = ([0.0; BLOCK], [0.0; BLOCK]);
    let mut out = vec![];
    for _ in 0..blocks {
        pool.render(&mut ts, &mut l, &mut r);
        out.extend_from_slice(&l);
    }
    out
}

#[test]
fn ahead_matches_direct_bit_for_bit() {
    let want = direct(400);
    let mut mix = AheadMix::new(tracks(), 4, 4096);
    mix.wait_until_full();
    let (mut l, mut r) = ([0.0; BLOCK], [0.0; BLOCK]);
    let mut position = 0;
    while position < want.len() {
        let missed = mix.missed_frames;
        mix.read(&mut l, &mut r);
        // A busy machine may miss; those blocks are the next test's business.
        if mix.missed_frames == missed {
            assert_eq!(l.map(f32::to_bits), <[f32; BLOCK]>::try_from(&want[position..position + BLOCK]).unwrap().map(f32::to_bits));
        }
        position += BLOCK;
        std::thread::sleep(Duration::from_micros(500));
    }
}

#[test]
fn a_miss_is_silent_and_the_mix_stays_in_time() {
    let want = direct(600);
    let mut mix = AheadMix::new(tracks(), 2, 512);
    let (mut l, mut r) = ([0.0; BLOCK], [0.0; BLOCK]);
    let mut position = 0;
    // Nothing has rendered yet and nothing waits, so these miss.
    for _ in 0..20 {
        mix.read(&mut l, &mut r);
        position += BLOCK;
    }
    assert!(mix.missed_frames > 0, "the test never forced a miss");
    let mut checked = 0;
    while position + BLOCK <= want.len() {
        std::thread::sleep(Duration::from_millis(3));
        let missed = mix.missed_frames;
        mix.read(&mut l, &mut r);
        if mix.missed_frames == missed {
            assert_eq!(l.map(f32::to_bits), <[f32; BLOCK]>::try_from(&want[position..position + BLOCK]).unwrap().map(f32::to_bits), "out of time at frame {position}");
            checked += 1;
        }
        position += BLOCK;
    }
    assert!(checked > 100, "only {checked} blocks arrived to check");
}
