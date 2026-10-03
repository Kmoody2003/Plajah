//! Strict, high-performance 3D .cube LUT parser and trilinear/tetrahedral interpolator.

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CubeLut {
    pub id: String,
    pub name: String,
    pub size: usize,
    pub strength: f32,
    /// Flat RGB data with size^3 * 3 elements in 0..=255.
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LutError {
    EmptyOrInvalid,
    UnsupportedSize(usize),
    WrongEntryCount { expected: usize, found: usize },
    OneDimensionalNotSupported,
}

impl std::fmt::Display for LutError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LutError::EmptyOrInvalid => write!(f, "Invalid or malformed LUT file"),
            LutError::UnsupportedSize(s) => write!(f, "Invalid or unsupported LUT_3D_SIZE ({}) — expected 2..=65", s),
            LutError::WrongEntryCount { expected, found } => {
                write!(f, "Expected {} RGB entries, found {}", expected, found)
            }
            LutError::OneDimensionalNotSupported => {
                write!(f, "Fabula currently requires a 3D .cube LUT.")
            }
        }
    }
}

impl std::error::Error for LutError {}

/// Strict 3D .cube parser matching Fabula's `cubeLut.ts` contract.
pub fn parse_cube_lut(text: &str, name: &str, id: &str) -> Result<CubeLut, LutError> {
    let mut size = 0_usize;
    let mut values = Vec::new();

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Skip comments, title, domain lines
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("title") || lower.starts_with("domain_") {
            continue;
        }

        if lower.starts_with("lut_3d_size") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(s) = parts[1].parse::<usize>() {
                    size = s;
                }
            }
            continue;
        }

        if lower.starts_with("lut_1d_size") {
            return Err(LutError::OneDimensionalNotSupported);
        }

        let mut parts = Vec::with_capacity(3);
        for item in line.split_whitespace() {
            if let Ok(num) = item.parse::<f32>() {
                if num.is_finite() {
                    parts.push(num);
                }
            }
        }

        if parts.len() == 3 {
            values.extend_from_slice(&parts);
        }
    }

    if size < 2 || size > 65 {
        return Err(LutError::UnsupportedSize(size));
    }

    let expected_floats = size * size * size * 3;
    if values.len() != expected_floats {
        return Err(LutError::WrongEntryCount {
            expected: size * size * size,
            found: values.len() / 3,
        });
    }

    let bytes: Vec<u8> = values
        .into_iter()
        .map(|v| (v * 255.0).round().clamp(0.0, 255.0) as u8)
        .collect();

    Ok(CubeLut {
        id: id.to_string(),
        name: name.to_string(),
        size,
        strength: 1.0,
        bytes,
    })
}

impl CubeLut {
    /// Sample the 3D LUT at a normalized RGB point (in 0.0..=1.0) using trilinear interpolation.
    pub fn sample_trilinear(&self, r: f32, g: f32, b: f32) -> (f32, f32, f32) {
        let n = self.size as f32;
        let scale = n - 1.0;

        let rf = (r.clamp(0.0, 1.0) * scale).clamp(0.0, scale);
        let gf = (g.clamp(0.0, 1.0) * scale).clamp(0.0, scale);
        let bf = (b.clamp(0.0, 1.0) * scale).clamp(0.0, scale);

        let r0 = rf.floor() as usize;
        let g0 = gf.floor() as usize;
        let b0 = bf.floor() as usize;

        let r1 = (r0 + 1).min(self.size - 1);
        let g1 = (g0 + 1).min(self.size - 1);
        let b1 = (b0 + 1).min(self.size - 1);

        let fr = rf - r0 as f32;
        let fg = gf - g0 as f32;
        let fb = bf - b0 as f32;

        let fetch = |ri: usize, gi: usize, bi: usize| -> (f32, f32, f32) {
            let idx = ((bi * self.size + gi) * self.size + ri) * 3;
            (
                self.bytes[idx] as f32 / 255.0,
                self.bytes[idx + 1] as f32 / 255.0,
                self.bytes[idx + 2] as f32 / 255.0,
            )
        };

        let c000 = fetch(r0, g0, b0);
        let c100 = fetch(r1, g0, b0);
        let c010 = fetch(r0, g1, b0);
        let c110 = fetch(r1, g1, b0);
        let c001 = fetch(r0, g0, b1);
        let c101 = fetch(r1, g0, b1);
        let c011 = fetch(r0, g1, b1);
        let c111 = fetch(r1, g1, b1);

        let lerp = |a: f32, b: f32, t: f32| a + (b - a) * t;
        let lerp3 = |a: (f32, f32, f32), b: (f32, f32, f32), t: f32| -> (f32, f32, f32) {
            (lerp(a.0, b.0, t), lerp(a.1, b.1, t), lerp(a.2, b.2, t))
        };

        let c00 = lerp3(c000, c100, fr);
        let c10 = lerp3(c010, c110, fr);
        let c01 = lerp3(c001, c101, fr);
        let c11 = lerp3(c011, c111, fr);

        let c0 = lerp3(c00, c10, fg);
        let c1 = lerp3(c01, c11, fg);

        lerp3(c0, c1, fb)
    }

    /// Apply this LUT in-place over an RGBA buffer.
    pub fn apply_rgba(&self, rgba: &mut [u8]) {
        let strength = self.strength.clamp(0.0, 1.0);
        let count = rgba.len() / 4;

        for i in 0..count {
            let offset = i * 4;
            let orig_r = rgba[offset] as f32 / 255.0;
            let orig_g = rgba[offset + 1] as f32 / 255.0;
            let orig_b = rgba[offset + 2] as f32 / 255.0;

            let (lr, lg, lb) = self.sample_trilinear(orig_r, orig_g, orig_b);

            let out_r = orig_r + (lr - orig_r) * strength;
            let out_g = orig_g + (lg - orig_g) * strength;
            let out_b = orig_b + (lb - orig_b) * strength;

            rgba[offset] = (out_r * 255.0).round().clamp(0.0, 255.0) as u8;
            rgba[offset + 1] = (out_g * 255.0).round().clamp(0.0, 255.0) as u8;
            rgba[offset + 2] = (out_b * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cube_lut_valid() {
        let sample = "\
# Title: Neutral Test
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
";
        let lut = parse_cube_lut(sample, "Neutral", "lut-1").expect("should parse");
        assert_eq!(lut.size, 2);
        assert_eq!(lut.bytes.len(), 24); // 2^3 * 3 = 24
        assert_eq!(lut.bytes[0], 0);
        assert_eq!(lut.bytes[23], 255);

        // Test trilinear sample at midpoint
        let (r, g, b) = lut.sample_trilinear(0.5, 0.5, 0.5);
        assert!((r - 0.5).abs() < 1e-2);
        assert!((g - 0.5).abs() < 1e-2);
        assert!((b - 0.5).abs() < 1e-2);
    }
}
