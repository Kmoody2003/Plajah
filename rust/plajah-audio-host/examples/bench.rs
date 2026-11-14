//! Serial vs multi-core on a real workload, paced like a device: one 128-frame block every 2.67 ms.
//!   cargo run --release -p plajah-audio-host --example bench [tracks] [voices] [seconds]
use plajah_audio::*;
use plajah_audio_host::*;
use std::time::{Duration, Instant};

fn main() {
    let arg = |i: usize, d: usize| std::env::args().nth(i).and_then(|a| a.parse().ok()).unwrap_or(d);
    let (n, voices, secs) = (arg(1, 32), arg(2, 8), arg(3, 4));
    let period = Duration::from_secs_f64(BLOCK as f64 / 48000.0);
    let blocks = secs * 48000 / BLOCK;
    let cores = std::thread::available_parallelism().map_or(4, |c| c.get());
    println!("{n} AURA tracks x {voices} voices, {secs}s, {cores} logical cores, deadline {:.2} ms", period.as_secs_f64() * 1e3);
    println!("Pro Audio priority: {}", promote_audio_thread());
    println!("threads   mean ms   p99 ms   max ms   late blocks   load");
    for threads in [1, 2, 4, 8, 12, 16, cores - 1].into_iter().filter(|t| *t < cores) {
        let mut tracks: Vec<Track> = (0..n)
            .map(|t| {
                let mut track = Track::new(48000.0);
                let e = track.engine().cast();
                unsafe {
                    pa_set_param(e, 1704, 1.0);
                    for v in 0..voices {
                        pa_note_on(e, 36.0 + ((t * 5 + v * 7) % 48) as f32, 0.8, v as u32 + 1, 0);
                    }
                }
                track
            })
            .collect();
        let mut pool = RenderPool::new(threads);
        let (mut l, mut r) = ([0.0; BLOCK], [0.0; BLOCK]);
        let mut times = Vec::with_capacity(blocks);
        let mut due = Instant::now();
        for _ in 0..blocks {
            let t0 = Instant::now();
            pool.render(&mut tracks, &mut l, &mut r);
            times.push(t0.elapsed());
            due += period;
            // An overloaded run stays behind rather than catching up, as a device would drop out.
            let now = Instant::now();
            if due < now {
                due = now;
            }
            while Instant::now() < due {
                std::hint::spin_loop();
            }
            std::hint::black_box(&l);
        }
        let late = times.iter().filter(|t| **t > period).count();
        let mean = times.iter().sum::<Duration>().as_secs_f64() / blocks as f64;
        times.sort();
        let ms = |d: Duration| d.as_secs_f64() * 1e3;
        println!("{threads:>7} {:>9.3} {:>8.3} {:>8.3} {late:>13} {:>5.0}%", mean * 1e3, ms(times[blocks * 99 / 100]), ms(times[blocks - 1]), mean / period.as_secs_f64() * 100.0);
    }
}
