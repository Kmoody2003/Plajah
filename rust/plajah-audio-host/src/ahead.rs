//! Render-ahead: sequenced tracks render ahead of the playhead on their own thread and pool, into a
//! ring the device thread only reads. A scheduling spike then eats into the lead, not the deadline.
//! Only tracks being played live have to render inside the device callback.

use crate::{CHUNK, RenderPool, Track};
use std::cell::UnsafeCell;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::*};
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// One writer, one reader. Positions only grow; the slot is position % capacity.
struct Ring {
    samples: Vec<UnsafeCell<[f32; 2]>>,
    written: AtomicU64,
    read: AtomicU64,
}
// Safety: the positions keep the writer and reader on different slots.
unsafe impl Sync for Ring {}

impl Ring {
    fn slot(&self, position: u64) -> *mut [f32; 2] {
        self.samples[(position % self.samples.len() as u64) as usize].get()
    }
    fn free(&self) -> u64 {
        self.samples.len() as u64 - (self.written.load(Acquire) - self.read.load(Acquire))
    }
}

pub struct AheadMix {
    ring: Arc<Ring>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    /// Frames the reader played as silence, to skip once they arrive so the mix stays in time.
    debt: u64,
    /// Frames that weren't ready when the device needed them: render-ahead's own dropouts.
    pub missed_frames: u64,
}

impl AheadMix {
    /// `lead` frames is how far ahead the mix may get, and so how long a stall it survives.
    pub fn new(mut tracks: Vec<Track>, threads: usize, lead: usize) -> Self {
        let ring = Arc::new(Ring {
            samples: (0..lead.max(CHUNK * 2)).map(|_| UnsafeCell::new([0.0; 2])).collect(),
            written: AtomicU64::new(0),
            read: AtomicU64::new(0),
        });
        let stop = Arc::new(AtomicBool::new(false));
        let (r, s) = (ring.clone(), stop.clone());
        let thread = thread::Builder::new()
            .name("plajah-audio-ahead".into())
            .spawn(move || {
                let mut pool = RenderPool::background(threads);
                let (mut left, mut right) = (Box::new([0.0; CHUNK]), Box::new([0.0; CHUNK]));
                while !s.load(Acquire) {
                    if r.free() < CHUNK as u64 {
                        thread::sleep(Duration::from_millis(1));
                        continue;
                    }
                    pool.render_chunk(&mut tracks, &mut left, &mut right);
                    let at = r.written.load(Relaxed);
                    for i in 0..CHUNK {
                        unsafe { *r.slot(at + i as u64) = [left[i], right[i]] };
                    }
                    r.written.store(at + CHUNK as u64, Release);
                }
            })
            .expect("spawn render-ahead thread");
        Self { ring, stop, thread: Some(thread), debt: 0, missed_frames: 0 }
    }

    /// Blocks until the lead is full, so playback starts with all of it.
    pub fn wait_until_full(&self) {
        while self.ring.free() >= CHUNK as u64 {
            thread::sleep(Duration::from_millis(1));
        }
    }

    /// Fills `left`/`right` for the device thread. Never waits: frames that aren't ready are silent.
    pub fn read(&mut self, left: &mut [f32], right: &mut [f32]) {
        let r = &*self.ring;
        let mut at = r.read.load(Relaxed);
        let mut ready = r.written.load(Acquire) - at;
        let skip = self.debt.min(ready);
        at += skip;
        ready -= skip;
        self.debt -= skip;
        let frames = left.len().min(right.len());
        let take = (frames as u64).min(ready) as usize;
        for i in 0..take {
            let [a, b] = unsafe { *r.slot(at + i as u64) };
            left[i] = a;
            right[i] = b;
        }
        left[take..frames].fill(0.0);
        right[take..frames].fill(0.0);
        let short = (frames - take) as u64;
        self.debt += short;
        self.missed_frames += short;
        r.read.store(at + take as u64, Release);
    }
}

impl Drop for AheadMix {
    fn drop(&mut self) {
        self.stop.store(true, Release);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}
