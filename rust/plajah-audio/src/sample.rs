//! Sample playback — the source that makes KERA sound.
//!
//! A voice in sample mode reads a loaded buffer instead of the oscillators, then runs through
//! the SAME filter / envelope / amp / spatial chain the synth uses. That shared output stage is
//! the whole point: KERA gets ONDA's zero-delay filters and its spatial rendering for free, and
//! every improvement to the core lifts both instruments.
//!
//! Reads are cubic-interpolated so pitch-shifting a sample up doesn't sound crunchy — the same
//! quality bar as the wavetable oscillator.

pub const MAX_SAMPLES: usize = 128;

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum LoopMode {
    #[default]
    Off,
    Forward,
    /// Loop while the key is held; play through to the end after release.
    Sustain,
}

impl LoopMode {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => LoopMode::Forward,
            2 => LoopMode::Sustain,
            _ => LoopMode::Off,
        }
    }
}

/// One loaded sample. Mono or stereo, stored channel-major.
#[derive(Default)]
pub struct Sample {
    pub channels: Vec<Vec<f32>>, // 1 = mono, 2 = stereo
    pub frames: usize,
    pub sample_rate: f32,
    pub root_note: f32,
    pub loop_start: usize,
    pub loop_end: usize,
    pub loop_mode: LoopMode,
    pub loaded: bool,
}

impl Sample {
    #[inline]
    fn read_channel(&self, ch: usize, pos: f64) -> f32 {
        let data = &self.channels[ch.min(self.channels.len() - 1)];
        let n = data.len();
        if n == 0 {
            return 0.0;
        }
        let i = pos as usize;
        let t = (pos - i as f64) as f32;
        // 4-point cubic Hermite. Clamp the neighbour indices so the ends never read out of bounds.
        let im1 = if i == 0 { 0 } else { i - 1 };
        let i0 = i.min(n - 1);
        let i1 = (i + 1).min(n - 1);
        let i2 = (i + 2).min(n - 1);
        let xm1 = data[im1];
        let x0 = data[i0];
        let x1 = data[i1];
        let x2 = data[i2];
        let c0 = x0;
        let c1 = 0.5 * (x1 - xm1);
        let c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2;
        let c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
        ((c3 * t + c2) * t + c1) * t + c0
    }
}

/// The engine's sample store.
pub struct SampleBank {
    samples: Vec<Sample>,
}

impl SampleBank {
    pub fn new() -> Self {
        let mut samples = Vec::with_capacity(MAX_SAMPLES);
        for _ in 0..MAX_SAMPLES {
            samples.push(Sample::default());
        }
        Self { samples }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn load(
        &mut self,
        slot: usize,
        data: &[f32],
        frames: usize,
        channels: usize,
        sample_rate: f32,
        root_note: f32,
        loop_start: usize,
        loop_end: usize,
        loop_mode: LoopMode,
    ) {
        if slot >= MAX_SAMPLES || frames == 0 || channels == 0 || channels > 2 {
            return;
        }
        if data.len() < frames * channels {
            return;
        }
        let mut chans: Vec<Vec<f32>> = Vec::with_capacity(channels);
        // Data is channel-major (all of ch0, then all of ch1), which is how the host stages it.
        for c in 0..channels {
            let base = c * frames;
            chans.push(data[base..base + frames].to_vec());
        }
        self.samples[slot] = Sample {
            channels: chans,
            frames,
            sample_rate: if sample_rate > 100.0 { sample_rate } else { 44100.0 },
            root_note,
            loop_start: loop_start.min(frames),
            loop_end: loop_end.min(frames),
            loop_mode,
            loaded: true,
        };
    }

    #[inline]
    pub fn get(&self, slot: usize) -> Option<&Sample> {
        self.samples.get(slot).filter(|s| s.loaded)
    }
}

/// Per-voice playback state.
#[derive(Clone, Copy, Default)]
pub struct SampleVoice {
    pub slot: i32, // -1 = not a sample voice (synth mode)
    pos: f64,
    finished: bool,
}

impl SampleVoice {
    pub fn start(&mut self, slot: i32, start_frame: f64) {
        self.slot = slot;
        self.pos = start_frame.max(0.0);
        self.finished = false;
    }

    pub fn clear(&mut self) {
        self.slot = -1;
        self.pos = 0.0;
        self.finished = false;
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        self.slot >= 0 && !self.finished
    }

    /// Advance and read one stereo frame. `rate` is the resampling ratio (native SR compensation
    /// folded in by the caller), `released` gates sustain loops. Returns (left, right).
    #[inline]
    pub fn next(&mut self, bank: &SampleBank, rate: f64, released: bool) -> (f32, f32) {
        if self.slot < 0 || self.finished {
            return (0.0, 0.0);
        }
        let sample = match bank.get(self.slot as usize) {
            Some(s) => s,
            None => {
                self.finished = true;
                return (0.0, 0.0);
            }
        };

        let l = sample.read_channel(0, self.pos);
        let r = if sample.channels.len() > 1 { sample.read_channel(1, self.pos) } else { l };

        self.pos += rate;

        let loop_active = match sample.loop_mode {
            LoopMode::Off => false,
            LoopMode::Forward => sample.loop_end > sample.loop_start,
            LoopMode::Sustain => !released && sample.loop_end > sample.loop_start,
        };
        if loop_active {
            let end = sample.loop_end as f64;
            if self.pos >= end {
                let len = (sample.loop_end - sample.loop_start) as f64;
                if len > 0.0 {
                    self.pos = sample.loop_start as f64 + ((self.pos - end) % len);
                }
            }
        } else if self.pos >= sample.frames as f64 {
            self.finished = true;
        }
        (l, r)
    }
}
