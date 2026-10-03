//! Plajah Core Engine
//!
//! Umbrella crate unifying all low-level native subsystems:
//! - `audio`: Real-time DSP audio synthesis and Melos instruments
//! - `math`: SIMD tracking, planar homography, and geometric transformations
//! - `color`: 3D .cube LUT processing and color grading pipeline

pub use plajah_audio as audio;
pub use plajah_color as color;
pub use plajah_math as math;

/// Returns the unified Plajah Core engine version string.
pub fn plajah_core_version() -> &'static str {
    "0.1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_core_subsystems_accessible() {
        assert_eq!(plajah_core_version(), "0.1.0");

        // Verify math access
        let identity = math::MAT3_IDENTITY;
        assert_eq!(identity[0], 1.0);

        // Verify color access
        let grade = color::ColorGrade::default();
        assert_eq!(grade.brightness, 1.0);
    }
}
