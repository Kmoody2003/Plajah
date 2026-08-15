//! Spatial output stage.
//!
//! Design rule for the whole engine: **a source has a position, not a stereo pan.** Stereo is
//! one rendering of that position, not the truth. This is what makes Eclipsa/IAMF export a data
//! transform later instead of a re-render — and it costs nothing now.
//!
//! Coordinates match the platform's existing convention (`components/spatialMixer/types.ts`
//! `position: [x, y, z]`, Web Audio listener facing -z): +x right, +y up, -z front.

/// Output layouts the engine can render. Phase 1 renders Stereo; the rest are wired through the
/// same panner so adding them is a table of speaker positions, not an engine change.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Layout {
    Stereo,
    Quad,
    Surround51,
    Surround714,
    /// First-order ambisonics (ACN/SN3D) — the natural carrier for IAMF scene-based elements.
    AmbisonicFoa,
}

impl Layout {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => Layout::Quad,
            2 => Layout::Surround51,
            3 => Layout::Surround714,
            4 => Layout::AmbisonicFoa,
            _ => Layout::Stereo,
        }
    }
    pub fn channels(self) -> usize {
        match self {
            Layout::Stereo => 2,
            Layout::Quad => 4,
            Layout::Surround51 => 6,
            Layout::Surround714 => 12,
            Layout::AmbisonicFoa => 4,
        }
    }
}

pub const MAX_CHANNELS: usize = 12;

/// A source position in the listener's space.
#[derive(Clone, Copy)]
pub struct Position {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Default for Position {
    fn default() -> Self {
        // Directly in front of the listener at unit distance.
        Self { x: 0.0, y: 0.0, z: -1.0 }
    }
}

impl Position {
    /// Azimuth in radians: 0 = front, +right, -left.
    #[inline]
    pub fn azimuth(&self) -> f32 {
        self.x.atan2(-self.z)
    }
    #[inline]
    pub fn elevation(&self) -> f32 {
        let horiz = (self.x * self.x + self.z * self.z).sqrt().max(1.0e-6);
        self.y.atan2(horiz)
    }
    #[inline]
    pub fn distance(&self) -> f32 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    /// Build from azimuth/elevation/distance — the form the UI and automation think in.
    #[inline]
    pub fn from_polar(az: f32, el: f32, dist: f32) -> Self {
        let ce = el.cos();
        Self { x: dist * ce * az.sin(), y: dist * el.sin(), z: -dist * ce * az.cos() }
    }
}

/// Speaker azimuths (radians, 0 = front) and elevations per layout.
fn speakers(layout: Layout) -> &'static [(f32, f32)] {
    use core::f32::consts::PI;
    const D: f32 = PI / 180.0;
    match layout {
        Layout::Stereo => &[(-30.0 * D, 0.0), (30.0 * D, 0.0)],
        Layout::Quad => &[(-45.0 * D, 0.0), (45.0 * D, 0.0), (-135.0 * D, 0.0), (135.0 * D, 0.0)],
        Layout::Surround51 => &[
            (-30.0 * D, 0.0), (30.0 * D, 0.0), (0.0, 0.0), (0.0, 0.0),
            (-110.0 * D, 0.0), (110.0 * D, 0.0),
        ],
        Layout::Surround714 => &[
            (-30.0 * D, 0.0), (30.0 * D, 0.0), (0.0, 0.0), (0.0, 0.0),
            (-90.0 * D, 0.0), (90.0 * D, 0.0), (-150.0 * D, 0.0), (150.0 * D, 0.0),
            (-45.0 * D, 45.0 * D), (45.0 * D, 45.0 * D),
            (-135.0 * D, 45.0 * D), (135.0 * D, 45.0 * D),
        ],
        Layout::AmbisonicFoa => &[(0.0, 0.0); 4],
    }
}

/// Per-channel gains for a position. Distance rolls off gently (not inverse-square — musical
/// sources want a usable range, and IAMF carries the real distance anyway).
pub fn pan_gains(pos: Position, layout: Layout, spread: f32, out: &mut [f32; MAX_CHANNELS]) {
    out.fill(0.0);
    let n = layout.channels();
    let dist = pos.distance().max(0.05);
    let atten = 1.0 / (1.0 + 0.6 * (dist - 1.0).max(0.0));

    if layout == Layout::AmbisonicFoa {
        // ACN/SN3D first order: W, Y, Z, X.
        let az = pos.azimuth();
        let el = pos.elevation();
        let (ce, se) = (el.cos(), el.sin());
        out[0] = 0.7071 * atten;
        out[1] = ce * az.sin() * atten;
        out[2] = se * atten;
        out[3] = ce * az.cos() * atten;
        return;
    }

    let az = pos.azimuth();
    let el = pos.elevation();
    let sp = speakers(layout);

    // Vector-ish panning: weight each speaker by angular proximity, widened by `spread` so a
    // source can be a point or a diffuse cloud. `spread` 0 = point source, 1 = fully diffuse.
    let sharp = 8.0 * (1.0 - spread.clamp(0.0, 0.98)) + 0.6;
    let mut sum = 0.0;
    for (i, &(saz, sel)) in sp.iter().enumerate().take(n) {
        // Angular distance on the sphere between source and speaker.
        let d_az = ((az - saz + core::f32::consts::PI).rem_euclid(core::f32::consts::TAU))
            - core::f32::consts::PI;
        let d_el = el - sel;
        let ang = (d_az * d_az + d_el * d_el).sqrt();
        let w = (-ang * ang * sharp).exp();
        out[i] = w;
        sum += w * w;
    }
    // Equal-power normalisation — moving a source must not change its loudness.
    let norm = if sum > 1.0e-9 { atten / sum.sqrt() } else { 0.0 };
    for i in 0..n {
        out[i] *= norm;
    }

    // 5.1/7.1.4 centre channel: pull in a share of the energy for sources near front-centre,
    // which is what keeps leads and vocals anchored rather than phantom-imaged.
    if matches!(layout, Layout::Surround51 | Layout::Surround714) {
        let front = (1.0 - (az.abs() / (core::f32::consts::PI * 0.25)).min(1.0)).max(0.0);
        let c = front * 0.5 * atten;
        if c > 0.0 {
            out[2] += c;
            let keep = (1.0 - front * 0.35).max(0.0);
            out[0] *= keep;
            out[1] *= keep;
        }
    }
}

/// A source's IAMF role. Mirrors `IAMFMetadata.groupType` in the TS model so the descriptor the
/// Spatial Mixer already builds can be produced straight from engine state.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum IamfRole {
    /// Rendered into the bed / scene-based element.
    Scene,
    /// Carried as its own object with position metadata — the thing worth spending on.
    Object,
}
