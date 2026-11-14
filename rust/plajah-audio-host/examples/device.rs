//! Plays a real session through the default device and counts dropouts.
//!   cargo run --release -p plajah-audio-host --example device -- <direct|ahead> [tracks] [voices] [seconds] [threads] [min|default] [stall_ms]
//! Chords retrigger every half second. Quiet on purpose: the mix is scaled to a low level.
//! `stall_ms` blocks the device thread once a second, to prove the underrun counter catches a gap.
use plajah_audio::*;
use plajah_audio_host::device::Output;
use plajah_audio_host::*;
use std::time::{Duration, Instant};

const LEVEL: f32 = 0.02;

fn track(sr: f32, t: usize, voices: usize, secs: usize) -> Track {
    let mut track = Track::new(sr);
    let e = track.engine().cast();
    unsafe {
        pa_set_param(e, 1704, 1.0);
        for chord in 0..secs * 2 {
            let at = chord as f64 * sr as f64 * 0.5;
            for v in 0..voices {
                let id = (chord * voices + v) as u32 + 1;
                pa_schedule_note_on(e, 36.0 + ((t * 5 + v * 7 + chord * 2) % 48) as f32, 0.8, id, at);
                pa_schedule_note_off(e, id, at + sr as f64 * 0.45);
            }
        }
    }
    track
}

fn main() -> windows::core::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let num = |i: usize, d: usize| args.get(i).and_then(|a| a.parse().ok()).unwrap_or(d);
    let ahead = args.first().is_some_and(|m| m == "ahead");
    let (n, voices, secs, threads) = (num(1, 8), num(2, 8), num(3, 10), num(4, 12));
    let smallest = args.get(5).is_some_and(|p| p == "min");
    let stall = Duration::from_millis(num(6, 0) as u64);

    let mut out = Output::open(smallest)?;
    let sr = out.sample_rate as f32;
    println!("{}: {} Hz, period {} frames ({:.1} ms)", out.device, out.sample_rate, out.period_frames, out.period_frames as f32 / sr * 1e3);
    println!("{} | {n} AURA tracks x {voices} voices | {threads} threads | {secs}s", if ahead { "render-ahead, 1 live track" } else { "direct" });

    let mut tracks: Vec<Track> = (0..n).map(|t| track(sr, t, voices, secs)).collect();
    let mut live = if ahead { tracks.split_off(n - 1) } else { tracks.split_off(0) };
    let mut mix = ahead.then(|| AheadMix::new(tracks, threads, (sr * 0.17) as usize));
    if let Some(m) = &mix {
        m.wait_until_full();
    }
    let mut pool = RenderPool::new(if ahead { 1 } else { threads });
    let gain = LEVEL / n as f32;
    let mut last_stall = Instant::now();
    let (mut a, mut b) = ([0.0; BLOCK], [0.0; BLOCK]);

    let stats = out.run(Duration::from_secs(secs as u64), |left, right| {
        if !stall.is_zero() && last_stall.elapsed() > Duration::from_secs(1) {
            last_stall = Instant::now();
            std::thread::sleep(stall);
        }
        pool.render(&mut live, left, right);
        if let Some(m) = &mut mix {
            m.read(&mut a, &mut b);
            for i in 0..BLOCK {
                left[i] += a[i];
                right[i] += b[i];
            }
        }
        for s in left.iter_mut().chain(right.iter_mut()) {
            *s *= gain;
        }
    })?;
    let mean = stats.total_fill.as_secs_f64() / stats.blocks as f64 * 1e3;
    println!(
        "device underruns {} | lost {:.0} ms | blocks {} | late {} | fill mean {mean:.3} ms, max {:.3} ms | ahead missed frames {}",
        stats.underruns, stats.lost_frames as f32 / sr * 1e3, stats.blocks, stats.late_blocks, stats.max_fill.as_secs_f64() * 1e3, mix.as_ref().map_or(0, |m| m.missed_frames),
    );
    Ok(())
}
