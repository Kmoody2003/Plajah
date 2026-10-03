//! Color grading operations matching Fabula's GPU compositor pipeline (`gpuComposite.ts`).

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ColorGrade {
    /// Multiplier on RGB (1.0 = identity).
    pub brightness: f32,
    /// Pivot around 0.5 (1.0 = identity).
    pub contrast: f32,
    /// Saturation blend towards Rec.709 luma (1.0 = identity, 0.0 = monochrome).
    pub saturation: f32,
    /// Warmth adjustment: pushes Red up, Blue down (0.0 = identity).
    pub warmth: f32,
    /// Hue rotation angle in radians (0.0 = identity).
    pub hue_radians: f32,
    /// Layer opacity multiplier (1.0 = full).
    pub opacity: f32,
}

impl Default for ColorGrade {
    fn default() -> Self {
        Self {
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            warmth: 0.0,
            hue_radians: 0.0,
            opacity: 1.0,
        }
    }
}

/// Luma-preserving BT.601 hue rotation matrix applying to an RGB tuple.
#[inline]
pub fn hue_rotate(r: f32, g: f32, b: f32, angle: f32) -> (f32, f32, f32) {
    if angle.abs() < 1e-6 {
        return (r, g, b);
    }
    let c = angle.cos();
    let s = angle.sin();

    let m00 = 0.213 + c * 0.787 - s * 0.213;
    let m01 = 0.213 - c * 0.213 + s * 0.143;
    let m02 = 0.213 - c * 0.213 - s * 0.787;

    let m10 = 0.715 - c * 0.715 - s * 0.715;
    let m11 = 0.715 + c * 0.285 + s * 0.140;
    let m12 = 0.715 - c * 0.715 + s * 0.715;

    let m20 = 0.072 - c * 0.072 + s * 0.928;
    let m21 = 0.072 - c * 0.072 - s * 0.283;
    let m22 = 0.072 + c * 0.928 + s * 0.072;

    (
        m00 * r + m10 * g + m20 * b,
        m01 * r + m11 * g + m21 * b,
        m02 * r + m12 * g + m22 * b,
    )
}

/// Apply color grade to a single normalized RGBA pixel.
#[inline]
pub fn grade_pixel(r: f32, g: f32, b: f32, a: f32, grade: &ColorGrade) -> (f32, f32, f32, f32) {
    // 1. Brightness
    let mut rgb = (
        r * grade.brightness,
        g * grade.brightness,
        b * grade.brightness,
    );

    // 2. Contrast
    rgb.0 = (rgb.0 - 0.5) * grade.contrast + 0.5;
    rgb.1 = (rgb.1 - 0.5) * grade.contrast + 0.5;
    rgb.2 = (rgb.2 - 0.5) * grade.contrast + 0.5;

    // 3. Saturation (Rec.709 luma)
    let luma = rgb.0 * 0.2126 + rgb.1 * 0.7152 + rgb.2 * 0.0722;
    rgb.0 = luma + (rgb.0 - luma) * grade.saturation;
    rgb.1 = luma + (rgb.1 - luma) * grade.saturation;
    rgb.2 = luma + (rgb.2 - luma) * grade.saturation;

    // 4. Warmth (push R up, B down)
    let w = grade.warmth;
    rgb.0 += w * 0.12;
    rgb.2 -= w * 0.12;

    // 5. Hue rotation
    rgb = hue_rotate(rgb.0, rgb.1, rgb.2, grade.hue_radians);

    // 6. Clamp to 0..=1
    rgb.0 = rgb.0.clamp(0.0, 1.0);
    rgb.1 = rgb.1.clamp(0.0, 1.0);
    rgb.2 = rgb.2.clamp(0.0, 1.0);

    // 7. Premultiplied alpha by layer opacity
    let out_a = a * grade.opacity;
    (rgb.0 * grade.opacity, rgb.1 * grade.opacity, rgb.2 * grade.opacity, out_a)
}

/// Apply color grade across an entire RGBA byte slice in place.
pub fn apply_grade_rgba(rgba: &mut [u8], grade: &ColorGrade) {
    let count = rgba.len() / 4;
    for i in 0..count {
        let idx = i * 4;
        let r = rgba[idx] as f32 / 255.0;
        let g = rgba[idx + 1] as f32 / 255.0;
        let b = rgba[idx + 2] as f32 / 255.0;
        let a = rgba[idx + 3] as f32 / 255.0;

        let (gr, gg, gb, ga) = grade_pixel(r, g, b, a, grade);

        rgba[idx] = (gr * 255.0).round().clamp(0.0, 255.0) as u8;
        rgba[idx + 1] = (gg * 255.0).round().clamp(0.0, 255.0) as u8;
        rgba[idx + 2] = (gb * 255.0).round().clamp(0.0, 255.0) as u8;
        rgba[idx + 3] = (ga * 255.0).round().clamp(0.0, 255.0) as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_grade() {
        let grade = ColorGrade::default();
        let (r, g, b, a) = grade_pixel(0.4, 0.6, 0.8, 1.0, &grade);
        assert!((r - 0.4).abs() < 1e-4);
        assert!((g - 0.6).abs() < 1e-4);
        assert!((b - 0.8).abs() < 1e-4);
        assert!((a - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_monochrome_saturation() {
        let grade = ColorGrade {
            saturation: 0.0,
            ..Default::default()
        };
        let (r, g, b, _) = grade_pixel(1.0, 0.0, 0.0, 1.0, &grade);
        // Pure red with saturation 0 should produce its Rec.709 luma value (0.2126) on all channels
        assert!((r - 0.2126).abs() < 1e-3);
        assert!((g - 0.2126).abs() < 1e-3);
        assert!((b - 0.2126).abs() < 1e-3);
    }
}
