//! Translation point tracker with brightness-invariant normalized patch error,
//! second-best ambiguity confidence, and subpixel parabolic peak refinement.

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct TrackPointResult {
    pub x: f32,
    pub y: f32,
    pub error: f32,
    pub confidence: f32,
}

pub struct GrayFrame<'a> {
    pub width: usize,
    pub height: usize,
    pub data: &'a [u8],
}

impl<'a> GrayFrame<'a> {
    pub const fn new(width: usize, height: usize, data: &'a [u8]) -> Self {
        Self { width, height, data }
    }

    #[inline]
    pub fn pixel(&self, x: isize, y: isize) -> f32 {
        let cx = x.clamp(0, (self.width as isize) - 1) as usize;
        let cy = y.clamp(0, (self.height as isize) - 1) as usize;
        self.data[cy * self.width + cx] as f32 / 255.0
    }
}

/// Zero-mean normalized patch error.
pub fn patch_error(
    a: &GrayFrame,
    b: &GrayFrame,
    ax: isize,
    ay: isize,
    bx: isize,
    by: isize,
    radius: isize,
) -> f32 {
    let mut sum_a = 0.0_f32;
    let mut sum_b = 0.0_f32;
    let mut count = 0_usize;

    for y in -radius..=radius {
        for x in -radius..=radius {
            sum_a += a.pixel(ax + x, ay + y);
            sum_b += b.pixel(bx + x, by + y);
            count += 1;
        }
    }

    let inv_count = 1.0 / count as f32;
    let mean_a = sum_a * inv_count;
    let mean_b = sum_b * inv_count;

    let mut error = 0.0_f32;
    let mut energy = 0.0_f32;

    for y in -radius..=radius {
        for x in -radius..=radius {
            let va = a.pixel(ax + x, ay + y) - mean_a;
            let vb = b.pixel(bx + x, by + y) - mean_b;
            let d = va - vb;
            error += d * d;
            energy += va * va + vb * vb;
        }
    }

    error / 1e-7_f32.max(energy)
}

/// Zero-mean patch energy — flat patches carry no trackable texture.
pub fn patch_texture(frame: &GrayFrame, x: f32, y: f32, radius: isize) -> f32 {
    let px = (x * (frame.width - 1) as f32).round() as isize;
    let py = (y * (frame.height - 1) as f32).round() as isize;
    let mut sum = 0.0_f32;
    let mut count = 0_usize;

    for j in -radius..=radius {
        for i in -radius..=radius {
            sum += frame.pixel(px + i, py + j);
            count += 1;
        }
    }

    let mean = sum / count as f32;
    let mut v = 0.0_f32;
    for j in -radius..=radius {
        for i in -radius..=radius {
            let d = frame.pixel(px + i, py + j) - mean;
            v += d * d;
        }
    }

    (v / count as f32).sqrt()
}

/// Translation point tracker matching Fabula's vectorTrack.ts contract.
pub fn track_point(
    previous: &GrayFrame,
    next: &GrayFrame,
    x: f32,
    y: f32,
    patch_radius: isize,
    search_radius: isize,
    predicted: Option<(f32, f32)>,
) -> TrackPointResult {
    let px = (x * (previous.width - 1) as f32).round() as isize;
    let py = (y * (previous.height - 1) as f32).round() as isize;

    let (pred_x, pred_y) = predicted.unwrap_or((x, y));
    let cx0 = (pred_x * (next.width - 1) as f32).round() as isize;
    let cy0 = (pred_y * (next.height - 1) as f32).round() as isize;

    let span = (2 * search_radius + 1) as usize;
    let mut errors = vec![0.0_f32; span * span];
    let mut best = f32::INFINITY;
    let mut bi = 0_usize;

    for dy in -search_radius..=search_radius {
        for dx in -search_radius..=search_radius {
            let e = patch_error(previous, next, px, py, cx0 + dx, cy0 + dy, patch_radius);
            let idx = ((dy + search_radius) as usize) * span + ((dx + search_radius) as usize);
            errors[idx] = e;
            if e < best {
                best = e;
                bi = idx;
            }
        }
    }

    let bdx = (bi % span) as isize - search_radius;
    let bdy = (bi / span) as isize - search_radius;
    let bx = cx0 + bdx;
    let by = cy0 + bdy;

    // Second-best is measured against the final winner, excluding 3x3 neighborhood
    let mut second = f32::INFINITY;
    for i in 0..errors.len() {
        let ddx = (i % span) as isize - search_radius - bdx;
        let ddy = (i / span) as isize - search_radius - bdy;
        if ddx.abs() <= 1 && ddy.abs() <= 1 {
            continue;
        }
        if errors[i] < second {
            second = errors[i];
        }
    }

    let at = |dx: isize, dy: isize| -> f32 {
        let ix = bdx + dx + search_radius;
        let iy = bdy + dy + search_radius;
        if ix >= 0 && iy >= 0 && (ix as usize) < span && (iy as usize) < span {
            errors[(iy as usize) * span + (ix as usize)]
        } else {
            patch_error(previous, next, px, py, bx + dx, by + dy, patch_radius)
        }
    };

    let refine = |lo: f32, mid: f32, hi: f32| -> f32 {
        let d = lo - 2.0 * mid + hi;
        if d.abs() < 1e-8 {
            0.0
        } else {
            (0.5 * (lo - hi) / d).clamp(-0.5, 0.5)
        }
    };

    let sx = bx as f32 + refine(at(-1, 0), best, at(1, 0));
    let sy = by as f32 + refine(at(0, -1), best, at(0, 1));

    let ambiguity = if second.is_finite() {
        ((second - best) / second.max(1e-7)).clamp(0.0, 1.0)
    } else {
        1.0
    };

    let quality = (-best * 8.0).exp();
    let confidence = (ambiguity * quality).sqrt();

    TrackPointResult {
        x: sx / (next.width - 1) as f32,
        y: sy / (next.height - 1) as f32,
        error: best,
        confidence,
    }
}

/// Convert RGBA buffer to Rec.709 luma GrayFrame (0.2126*R + 0.7152*G + 0.0722*B).
pub fn gray_from_rgba(rgba: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut gray = vec![0_u8; width * height];
    for (i, g) in gray.iter_mut().enumerate() {
        let idx = i * 4;
        let r = rgba[idx] as f32;
        let g_val = rgba[idx + 1] as f32;
        let b = rgba[idx + 2] as f32;
        let luma = (r * 0.2126 + g_val * 0.7152 + b * 0.0722).round() as u8;
        *g = luma;
    }
    gray
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_frame(dx: i32, dy: i32) -> (usize, usize, Vec<u8>) {
        let width = 48;
        let height = 40;
        let mut data = vec![0_u8; width * height];
        for y in 0..height {
            for x in 0..width {
                let qx = x as i32 - dx;
                let qy = y as i32 - dy;
                data[y * width + x] = if qx >= 15 && qx < 25 && qy >= 12 && qy < 22 {
                    (80 + (qx - 15) * 13 + (qy - 12) * 4).clamp(0, 255) as u8
                } else {
                    12
                };
            }
        }
        (width, height, data)
    }

    #[test]
    fn test_point_tracker_normalized_coordinates() {
        let (w, h, data_a) = make_test_frame(0, 0);
        let (_, _, data_b) = make_test_frame(4, -3);

        let frame_a = GrayFrame::new(w, h, &data_a);
        let frame_b = GrayFrame::new(w, h, &data_b);

        let result = track_point(
            &frame_a,
            &frame_b,
            20.0 / 47.0,
            17.0 / 39.0,
            5,
            8,
            None,
        );

        assert!((result.x - 24.0 / 47.0).abs() < 0.02);
        assert!((result.y - 14.0 / 39.0).abs() < 0.02);
        assert!(result.confidence > 0.5);
    }
}
