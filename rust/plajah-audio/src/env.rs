//! Breakpoint envelopes — Absynth's actual soul.
//!
//! Absynth's depth came from envelopes that were not ADSR: arbitrary-length breakpoint lists
//! with per-segment curvature, assignable to any parameter. Almost nothing else has ever shipped
//! that. So the engine's only envelope type is a breakpoint list, and ADSR is expressed as four
//! breakpoints — one code path, two levels of UI depth.

pub const MAX_POINTS: usize = 16;

#[derive(Clone, Copy)]
pub struct Point {
    /// Seconds from the previous point.
    pub time: f32,
    pub level: f32,
    /// -1 = logarithmic, 0 = linear, +1 = exponential. Curvature is what makes an envelope
    /// sound "analog" rather than like a ramp.
    pub curve: f32,
}

impl Default for Point {
    fn default() -> Self {
        Self { time: 0.0, level: 0.0, curve: 0.0 }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Stage {
    Idle,
    Running,
    Sustain,
    Release,
}

#[derive(Clone, Copy)]
pub struct Envelope {
    pub points: [Point; MAX_POINTS],
    pub count: usize,
    /// Index of the point the envelope holds on while the key is down. usize::MAX = no sustain.
    pub sustain_point: usize,
    stage: Stage,
    idx: usize,
    t: f32,
    from: f32,
    value: f32,
    release_from: f32,
    release_t: f32,
    pub release_time: f32,
    pub release_curve: f32,
}

impl Default for Envelope {
    fn default() -> Self {
        let mut e = Self {
            points: [Point::default(); MAX_POINTS],
            count: 0,
            sustain_point: usize::MAX,
            stage: Stage::Idle,
            idx: 0,
            t: 0.0,
            from: 0.0,
            value: 0.0,
            release_from: 0.0,
            release_t: 0.0,
            release_time: 0.05,
            release_curve: -0.4,
        };
        e.set_adsr(0.002, 0.12, 0.7, 0.25);
        e
    }
}

/// Shape a 0..1 ramp by curvature. Negative bends toward fast-then-slow (log), positive toward
/// slow-then-fast (exp); 0 is linear.
#[inline]
fn shape(x: f32, curve: f32) -> f32 {
    if curve.abs() < 0.001 {
        return x;
    }
    // Smooth, monotonic, and symmetric about curve = 0.
    let k = curve.clamp(-1.0, 1.0) * 5.0;
    let e = (-k).exp();
    ((-k * x).exp() - 1.0) / (e - 1.0)
}

impl Envelope {
    /// Express a classic ADSR as breakpoints, so the simple UI and the deep UI drive one engine.
    pub fn set_adsr(&mut self, a: f32, d: f32, s: f32, r: f32) {
        self.points[0] = Point { time: 0.0, level: 0.0, curve: 0.0 };
        self.points[1] = Point { time: a.max(0.0005), level: 1.0, curve: -0.3 };
        self.points[2] = Point { time: d.max(0.0005), level: s.clamp(0.0, 1.0), curve: -0.5 };
        self.count = 3;
        self.sustain_point = 2;
        self.release_time = r.max(0.001);
        self.release_curve = -0.4;
    }

    pub fn note_on(&mut self) {
        self.stage = Stage::Running;
        self.idx = 1;
        self.t = 0.0;
        self.from = self.value; // retrigger from wherever we are — no click
    }

    pub fn note_off(&mut self) {
        if self.stage == Stage::Idle {
            return;
        }
        self.stage = Stage::Release;
        self.release_from = self.value;
        self.release_t = 0.0;
    }

    pub fn hard_reset(&mut self) {
        self.stage = Stage::Idle;
        self.value = 0.0;
        self.from = 0.0;
        self.idx = 0;
        self.t = 0.0;
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        self.stage != Stage::Idle
    }

    #[inline]
    pub fn value(&self) -> f32 {
        self.value
    }

    #[inline]
    pub fn tick(&mut self, dt: f32) -> f32 {
        match self.stage {
            Stage::Idle => self.value = 0.0,
            Stage::Sustain => {}
            Stage::Release => {
                self.release_t += dt;
                let x = (self.release_t / self.release_time).min(1.0);
                self.value = self.release_from * (1.0 - shape(x, self.release_curve));
                if x >= 1.0 {
                    self.value = 0.0;
                    self.stage = Stage::Idle;
                }
            }
            Stage::Running => {
                if self.idx >= self.count {
                    self.stage = Stage::Idle;
                    return self.value;
                }
                let p = self.points[self.idx];
                self.t += dt;
                let dur = p.time.max(0.0001);
                let x = (self.t / dur).min(1.0);
                self.value = self.from + (p.level - self.from) * shape(x, p.curve);
                if x >= 1.0 {
                    self.from = p.level;
                    self.t = 0.0;
                    if self.idx == self.sustain_point {
                        self.stage = Stage::Sustain;
                    } else {
                        self.idx += 1;
                        if self.idx >= self.count {
                            self.stage = Stage::Idle;
                        }
                    }
                }
            }
        }
        self.value
    }
}
