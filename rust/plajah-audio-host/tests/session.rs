//! A session driven by a clock must produce what a direct engine produces, frame for frame.
use plajah_audio::*;
use plajah_audio_host::session::*;
use plajah_audio_host::*;
use std::collections::BTreeMap;
use std::time::Duration;

const START: u64 = 4800; // the context has been running a while before the first track plays

fn direct(frames: usize) -> Vec<f32> {
    let mut t = Track::new(48000.0);
    let e = t.engine().cast();
    unsafe {
        pa_set_param(e, 1704, 1.0);
        pa_reset_transport(e, START as f64);
        pa_schedule_note_on(e, 48.0, 0.8, 1, (START + 9000) as f64);
        pa_schedule_note_off(e, 1, (START + 30000) as f64);
    }
    let mut out = vec![];
    while out.len() < frames {
        unsafe {
            pa_render(e, BLOCK as u32);
            out.extend_from_slice(std::slice::from_raw_parts(pa_out_ptr(e, 0), BLOCK));
        }
    }
    out
}

#[test]
fn session_chunks_match_a_direct_engine_at_their_frames() {
    let s = Session::new(48000.0, 4);
    let track = s.add_track();
    s.command(track, Cmd::Param { id: 1704, value: 1.0 });
    s.clock(START);
    s.command(track, Cmd::On { note: 48.0, velocity: 0.8, voice: 1, frame: (START + 9000) as f64 });
    s.command(track, Cmd::Off { voice: 1, frame: (START + 30000) as f64 });

    let mut got = BTreeMap::new();
    // Half of real time, so a debug build keeps its lead on a busy machine too.
    // The clock starts at the first chunk: starting the session isn't what's being timed.
    let mut began: Option<std::time::Instant> = None;
    let mut clock = START;
    while clock < START + 48000 {
        if let Some(began) = began {
            clock = START + (began.elapsed().as_secs_f64() * 24000.0) as u64;
            s.clock(clock);
        }
        while let Some(c) = s.next_chunk(Duration::from_millis(1)) {
            began.get_or_insert_with(std::time::Instant::now);
            let frame = f64::from_le_bytes(c[8..16].try_into().unwrap()) as u64;
            let silent = u32::from_le_bytes(c[4..8].try_into().unwrap()) & FLAG_SILENT != 0;
            let left: Vec<f32> = if silent {
                vec![0.0; CHUNK]
            } else {
                c[CHUNK_HEADER_BYTES..].chunks_exact(4).take(CHUNK).map(|b| f32::from_le_bytes(b.try_into().unwrap())).collect()
            };
            got.insert(frame, left);
        }
    }
    assert_eq!(s.stats().late_notes.load(std::sync::atomic::Ordering::Relaxed), 0);
    assert_eq!(s.stats().jumps.load(std::sync::atomic::Ordering::Relaxed), 0, "the test clock outran the render");
    let want = direct(60000);
    let mut sounding = 0;
    for (frame, left) in &got {
        let at = (*frame - START) as usize;
        if at + CHUNK > want.len() {
            continue;
        }
        for i in 0..CHUNK {
            assert_eq!(left[i].to_bits(), want[at + i].to_bits(), "frame {}", frame + i as u64);
        }
        sounding += left.iter().any(|x| x.abs() > 1e-3) as usize;
    }
    assert!(sounding > 5, "only {sounding} chunks had sound");
}
