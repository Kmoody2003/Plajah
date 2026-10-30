//! One browser AudioContext's worth of native tracks. Renders each track ahead of the context's
//! clock and hands out per-track chunks stamped with their context frame, so the browser's graph
//! (FX rack, mixer, bounces) keeps working and the two can't drift: there is only one clock.
//!
//! The lead has to stay under the scheduler's 150 ms lookahead (scheduler.ts), or notes would arrive
//! for frames already rendered: LEAD + one CHUNK is 106 ms at 48 kHz.

use crate::{CHUNK, RenderPool, Track};
use plajah_audio::*;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::*};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const LEAD_SECONDS: f64 = 0.085;
/// Chunks waiting for the host beyond this mean it has stopped reading; stop rendering for it.
const MAX_OUTBOX: usize = 256;
pub const CHUNK_HEADER_BYTES: usize = 16;
pub const FLAG_SILENT: u32 = 1;
/// Flags above this bit count the track's hard stops, so the browser can drop what was already in flight.
pub const EPOCH_SHIFT: u32 = 1;

#[derive(Clone, Copy)]
pub enum Cmd {
    Param { id: u32, value: f32 },
    On { note: f32, velocity: f32, voice: u32, frame: f64 },
    Off { voice: u32, frame: f64 },
    AllOff { hard: bool },
    Expression { voice: u32, bend: f32, pressure: f32, timbre: f32 },
    Macro { index: u32, value: f32 },
    Route { index: u32, source: u32, dest: u32, depth: f32, via: u32 },
    ModWheel(f32),
    PitchBend(f32),
    Tempo(f32),
}

#[derive(Default)]
struct Inbox {
    commands: VecDeque<(u32, Cmd)>,
    add: u32,
    remove: Vec<u32>,
}

#[derive(Default)]
pub struct Stats {
    pub chunks: AtomicU64,
    /// Notes that arrived for frames already rendered, so they played late.
    pub late_notes: AtomicU64,
    /// Times the clock overtook the render and it had to skip forward.
    pub jumps: AtomicU64,
}

struct Shared {
    inbox: Mutex<Inbox>,
    outbox: Mutex<VecDeque<Vec<u8>>>,
    ready: Condvar,
    clock: AtomicU64,
    clocked: AtomicBool,
    stop: AtomicBool,
    next_track: AtomicU64,
    stats: Stats,
}

pub struct Session {
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

impl Session {
    pub fn new(sample_rate: f32, threads: usize) -> Self {
        let shared = Arc::new(Shared {
            inbox: Mutex::default(),
            outbox: Mutex::default(),
            ready: Condvar::new(),
            clock: AtomicU64::new(0),
            clocked: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            next_track: AtomicU64::new(0),
            stats: Stats::default(),
        });
        let s = shared.clone();
        let thread = thread::Builder::new()
            .name("plajah-audio-session".into())
            .spawn(move || render_loop(&s, sample_rate, threads))
            .expect("spawn session thread");
        Self { shared, thread: Some(thread) }
    }

    pub fn add_track(&self) -> u32 {
        self.shared.inbox.lock().unwrap().add += 1;
        self.shared.next_track.fetch_add(1, SeqCst) as u32
    }

    pub fn remove_track(&self, track: u32) {
        self.shared.inbox.lock().unwrap().remove.push(track);
    }

    pub fn command(&self, track: u32, cmd: Cmd) {
        self.shared.inbox.lock().unwrap().commands.push_back((track, cmd));
    }

    /// The context's current frame, as reported by the browser's audio thread.
    pub fn clock(&self, frame: u64) {
        self.shared.clock.store(frame, Release);
        self.shared.clocked.store(true, Release);
    }

    /// The next chunk, waiting up to `timeout`. Layout: u32 track, u32 flags, f64 frame, then unless
    /// `FLAG_SILENT` is set, CHUNK left then CHUNK right as f32.
    pub fn next_chunk(&self, timeout: Duration) -> Option<Vec<u8>> {
        let queue = self.shared.outbox.lock().unwrap();
        let (mut queue, _) = self.shared.ready.wait_timeout_while(queue, timeout, |q| q.is_empty() && !self.shared.stop.load(Acquire)).unwrap();
        queue.pop_front()
    }

    pub fn stats(&self) -> &Stats {
        &self.shared.stats
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.shared.stop.store(true, Release);
        self.shared.ready.notify_all();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn apply(track: &mut Track, cmd: Cmd, rendered: u64, stats: &Stats) {
    let e = track.engine().cast();
    unsafe {
        match cmd {
            Cmd::Param { id, value } => pa_set_param(e, id, value),
            Cmd::On { note, velocity, voice, frame } => {
                stats.late_notes.fetch_add((frame < rendered as f64) as u64, Relaxed);
                pa_schedule_note_on(e, note, velocity, voice, frame)
            }
            Cmd::Off { voice, frame } => pa_schedule_note_off(e, voice, frame),
            Cmd::AllOff { hard } => {
                pa_clear_schedule(e);
                pa_all_notes_off(e, hard as u32)
            }
            Cmd::Expression { voice, bend, pressure, timbre } => pa_set_expression(e, voice, bend, pressure, timbre),
            Cmd::Macro { index, value } => pa_set_macro(e, index, value),
            Cmd::Route { index, source, dest, depth, via } => pa_set_route(e, index, source, dest, depth, via),
            Cmd::ModWheel(v) => pa_set_mod_wheel(e, v),
            Cmd::PitchBend(v) => pa_set_pitch_bend(e, v),
            Cmd::Tempo(v) => pa_set_tempo(e, v),
        }
    }
}

fn render_loop(s: &Shared, sample_rate: f32, threads: usize) {
    let lead = (LEAD_SECONDS * sample_rate as f64) as u64;
    let mut pool = RenderPool::background(threads);
    // Parallel to `tracks`; removed tracks leave the render, their ids are never reused.
    let mut ids: Vec<u32> = vec![];
    let mut tracks: Vec<Track> = vec![];
    let mut epochs: Vec<u32> = vec![];
    let mut next_id = 0;
    let mut rendered: u64 = 0;
    let mut started = false;
    while !s.stop.load(Acquire) {
        let clock = s.clock.load(Acquire);
        if !started && s.clocked.load(Acquire) {
            started = true;
            rendered = clock;
            for t in &mut tracks {
                unsafe { pa_reset_transport(t.engine().cast(), rendered as f64) };
            }
        }
        if started && clock > rendered {
            // With nothing to render the clock just passes by.
            s.stats.jumps.fetch_add(!tracks.is_empty() as u64, Relaxed);
            rendered = clock;
            for t in &mut tracks {
                unsafe { pa_reset_transport(t.engine().cast(), rendered as f64) };
            }
        }
        {
            let mut inbox = s.inbox.lock().unwrap();
            for _ in 0..std::mem::take(&mut inbox.add) {
                let mut t = Track::new(sample_rate);
                unsafe { pa_reset_transport(t.engine().cast(), rendered as f64) };
                ids.push(next_id);
                tracks.push(t);
                epochs.push(0);
                next_id += 1;
            }
            for dead in std::mem::take(&mut inbox.remove) {
                if let Some(i) = ids.iter().position(|id| *id == dead) {
                    ids.remove(i);
                    tracks.remove(i);
                    epochs.remove(i);
                }
            }
            while let Some((id, cmd)) = inbox.commands.pop_front() {
                if let Some(i) = ids.iter().position(|t| *t == id) {
                    epochs[i] += matches!(cmd, Cmd::AllOff { hard: true }) as u32;
                    apply(&mut tracks[i], cmd, rendered, &s.stats);
                }
            }
        }
        let backed_up = s.outbox.lock().unwrap().len() >= MAX_OUTBOX;
        if !started || tracks.is_empty() || backed_up || rendered >= clock + lead {
            thread::sleep(Duration::from_millis(1));
            continue;
        }
        pool.render_tracks(&mut tracks);
        let mut outbox = s.outbox.lock().unwrap();
        for ((id, t), epoch) in ids.iter().zip(&tracks).zip(&epochs) {
            let samples = t.chunk_samples();
            let silent = samples.iter().all(|x| *x == 0.0);
            let mut msg = Vec::with_capacity(CHUNK_HEADER_BYTES + if silent { 0 } else { samples.len() * 4 });
            msg.extend_from_slice(&id.to_le_bytes());
            msg.extend_from_slice(&(epoch << EPOCH_SHIFT | if silent { FLAG_SILENT } else { 0 }).to_le_bytes());
            msg.extend_from_slice(&(rendered as f64).to_le_bytes());
            if !silent {
                msg.extend(samples.iter().flat_map(|x| x.to_le_bytes()));
            }
            outbox.push_back(msg);
        }
        drop(outbox);
        s.ready.notify_all();
        s.stats.chunks.fetch_add(1, Relaxed);
        rendered += CHUNK as u64;
    }
}
