//! Renders one `plajah-audio` engine per track across CPU cores, then mixes them in track order.
//!
//! The browser runs every worklet of a context on one audio thread. Engines share no state, so
//! natively each can render on any core. The calling thread (the device callback, later) takes
//! tracks too, so a block still finishes if the workers are slow to wake.
//! No allocation or locks in `render`; workers spin briefly between blocks, then park.

pub mod ahead;
#[cfg(windows)]
pub mod device;
pub use ahead::AheadMix;

use plajah_audio::{pa_create, pa_destroy, pa_out_ptr, pa_render};
use std::ffi::c_void;
use std::hint::spin_loop;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering::*};
use std::thread::{self, JoinHandle, Thread};
use std::time::{Duration, Instant};

/// The worklet's block, and the size the pool renders at.
pub const BLOCK: usize = 128;
/// Blocks a worker takes per track when rendering ahead. Waking the pool once per 2048 frames rather
/// than per 128 is most of what render-ahead gains in throughput.
pub const CHUNK_BLOCKS: usize = 16;
pub const CHUNK: usize = BLOCK * CHUNK_BLOCKS;
/// Long enough to catch the next block at small buffers under load, short enough not to burn a core.
const SPIN: Duration = Duration::from_micros(200);

/// One instrument. Owns its engine; calls go straight to the `pa_*` ABI through `engine()`.
pub struct Track {
    engine: *mut c_void,
    /// Left then right of the last `render_chunk`.
    chunk: Vec<f32>,
}

// Safety: the engine has no thread affinity and a Track is its only owner.
unsafe impl Send for Track {}

impl Track {
    pub fn new(sample_rate: f32) -> Self {
        Self { engine: pa_create(sample_rate) as *mut c_void, chunk: Vec::new() }
    }
    /// For the `pa_*` calls: `pa_note_on(track.engine().cast(), ...)`. Only valid between blocks.
    pub fn engine(&mut self) -> *mut c_void {
        self.engine
    }
    fn render(&mut self, frames: usize) {
        unsafe { pa_render(self.engine.cast(), frames as u32) }
    }
    fn render_chunk(&mut self) {
        for b in 0..CHUNK_BLOCKS {
            self.render(BLOCK);
            let (l, r) = unsafe {
                (std::slice::from_raw_parts(pa_out_ptr(self.engine.cast(), 0), BLOCK), std::slice::from_raw_parts(pa_out_ptr(self.engine.cast(), 1), BLOCK))
            };
            let (cl, cr) = self.chunk.split_at_mut(CHUNK);
            cl[b * BLOCK..][..BLOCK].copy_from_slice(l);
            cr[b * BLOCK..][..BLOCK].copy_from_slice(r);
        }
    }
    /// Left/right of the last render.
    fn out(&mut self, frames: usize) -> (&[f32], &[f32]) {
        unsafe {
            let l = pa_out_ptr(self.engine.cast(), 0);
            let r = pa_out_ptr(self.engine.cast(), 1);
            (std::slice::from_raw_parts(l, frames), std::slice::from_raw_parts(r, frames))
        }
    }
}

impl Drop for Track {
    fn drop(&mut self) {
        unsafe { pa_destroy(self.engine.cast()) }
    }
}

struct Shared {
    epoch: AtomicU64,
    next: AtomicUsize,
    done: AtomicUsize,
    frames: AtomicUsize, // 0 means a whole chunk
    count: AtomicUsize,
    tracks: AtomicUsize, // *mut Track, valid while done < count
    quit: AtomicBool,
    asleep: Vec<AtomicBool>,
}

impl Shared {
    /// Claims tracks until none are left. `render` closes the block before it resets anything, so a
    /// late worker's claim lands past the end and does nothing.
    fn drain(&self) {
        loop {
            let i = self.next.fetch_add(1, AcqRel);
            if i >= self.count.load(Acquire) {
                return;
            }
            let track = (self.tracks.load(Acquire) as *mut Track).wrapping_add(i);
            // Safety: `next` hands out each index once per block, and `render` holds &mut on the
            // tracks until `done` reaches `count`.
            match self.frames.load(Acquire) {
                0 => unsafe { (*track).render_chunk() },
                frames => unsafe { (*track).render(frames) },
            }
            self.done.fetch_add(1, AcqRel);
        }
    }
}

/// Registers the calling thread with Windows' multimedia scheduler as "Pro Audio", critical priority,
/// which is what keeps other work off it. Workers do this themselves; the device thread must too.
/// Returns false if Windows refused, where the thread carries on at normal priority.
#[cfg(windows)]
pub fn promote_audio_thread() -> bool {
    #[link(name = "avrt")]
    unsafe extern "system" {
        fn AvSetMmThreadCharacteristicsW(task: *const u16, index: *mut u32) -> *mut c_void;
        fn AvSetMmThreadPriority(handle: *mut c_void, priority: i32) -> i32;
    }
    const AVRT_PRIORITY_CRITICAL: i32 = 2;
    let task: Vec<u16> = "Pro Audio".encode_utf16().chain([0]).collect();
    let mut index = 0;
    unsafe {
        let h = AvSetMmThreadCharacteristicsW(task.as_ptr(), &mut index);
        !h.is_null() && AvSetMmThreadPriority(h, AVRT_PRIORITY_CRITICAL) != 0
    }
}
#[cfg(not(windows))]
pub fn promote_audio_thread() -> bool {
    false
}

pub struct RenderPool {
    shared: Arc<Shared>,
    workers: Vec<JoinHandle<()>>,
    threads: Vec<Thread>,
}

impl RenderPool {
    /// `threads` includes the caller, so 1 starts no workers and renders serially.
    pub fn new(threads: usize) -> Self {
        Self::start(threads, true)
    }

    /// For render-ahead: normal priority and no spinning between chunks. These workers have the lead
    /// to spare, and at critical priority they take cores from the device thread, which has none.
    pub fn background(threads: usize) -> Self {
        Self::start(threads, false)
    }

    fn start(threads: usize, realtime: bool) -> Self {
        let helpers = threads.max(1) - 1;
        let shared = Arc::new(Shared {
            epoch: AtomicU64::new(0),
            next: AtomicUsize::new(0),
            done: AtomicUsize::new(0),
            frames: AtomicUsize::new(0),
            count: AtomicUsize::new(0),
            tracks: AtomicUsize::new(0),
            quit: AtomicBool::new(false),
            asleep: (0..helpers).map(|_| AtomicBool::new(false)).collect(),
        });
        let workers: Vec<_> = (0..helpers)
            .map(|w| {
                let s = shared.clone();
                thread::Builder::new()
                    .name(format!("plajah-audio-{w}"))
                    .spawn(move || worker(&s, w, realtime))
                    .expect("spawn audio worker")
            })
            .collect();
        let threads = workers.iter().map(|h| h.thread().clone()).collect();
        Self { shared, workers, threads }
    }

    /// Renders every track for one block and mixes them into `left`/`right`.
    pub fn render(&mut self, tracks: &mut [Track], left: &mut [f32], right: &mut [f32]) {
        let frames = left.len().min(right.len()).min(BLOCK);
        self.run(tracks, frames);
        left[..frames].fill(0.0);
        right[..frames].fill(0.0);
        for t in tracks.iter_mut() {
            let (l, r) = t.out(frames);
            for i in 0..frames {
                left[i] += l[i];
                right[i] += r[i];
            }
        }
    }

    /// Renders every track for `CHUNK` frames and mixes them into `left`/`right`.
    pub fn render_chunk(&mut self, tracks: &mut [Track], left: &mut [f32; CHUNK], right: &mut [f32; CHUNK]) {
        for t in tracks.iter_mut() {
            t.chunk.resize(CHUNK * 2, 0.0); // once, before the first chunk; this is not the device thread
        }
        self.run(tracks, 0);
        left.fill(0.0);
        right.fill(0.0);
        for t in tracks.iter() {
            let (l, r) = t.chunk.split_at(CHUNK);
            for i in 0..CHUNK {
                left[i] += l[i];
                right[i] += r[i];
            }
        }
    }

    fn run(&mut self, tracks: &mut [Track], frames: usize) {
        let s = &*self.shared;
        // Close the last block first: `next` stays past the end while the fields below change, so
        // no worker can claim against half-written state.
        s.next.store(usize::MAX / 2, SeqCst);
        s.frames.store(frames, Release);
        s.tracks.store(tracks.as_mut_ptr() as usize, Release);
        s.count.store(tracks.len(), Release);
        s.done.store(0, Release);
        s.next.store(0, SeqCst);
        s.epoch.fetch_add(1, SeqCst);
        for (asleep, t) in s.asleep.iter().zip(&self.threads) {
            if asleep.load(SeqCst) {
                t.unpark();
            }
        }
        s.drain();
        while s.done.load(Acquire) < tracks.len() {
            spin_loop();
        }
        // Every track is done and `next` is past the end, so the callers' borrows are exclusive again.
    }
}

fn worker(s: &Shared, w: usize, realtime: bool) {
    if realtime {
        promote_audio_thread();
    }
    let spin = if realtime { SPIN } else { Duration::ZERO };
    let mut seen = 0;
    while !s.quit.load(Acquire) {
        let now = s.epoch.load(SeqCst);
        if now != seen {
            seen = now;
            s.drain();
            continue;
        }
        let since = Instant::now();
        while s.epoch.load(Acquire) == seen && since.elapsed() < spin {
            spin_loop();
        }
        if s.epoch.load(Acquire) == seen {
            s.asleep[w].store(true, SeqCst);
            // Rechecked after the flag, so a block published in between can't be slept through.
            if s.epoch.load(SeqCst) == seen && !s.quit.load(SeqCst) {
                thread::park();
            }
            s.asleep[w].store(false, SeqCst);
        }
    }
}

impl Drop for RenderPool {
    fn drop(&mut self) {
        self.shared.quit.store(true, SeqCst);
        for t in &self.threads {
            t.unpark();
        }
        for h in self.workers.drain(..) {
            let _ = h.join();
        }
    }
}
