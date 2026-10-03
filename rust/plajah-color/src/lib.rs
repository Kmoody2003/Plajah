//! Plajah Color Science Engine
//!
//! Provides ultra-fast 3D .cube LUT parsing/sampling and color grading operations:
//! - Strict 3D LUT parser and trilinear interpolator (`lut`)
//! - Brightness, contrast, Rec.709 saturation, warmth, and BT.601 hue rotation (`grade`)

pub mod grade;
pub mod lut;

pub use grade::{apply_grade_rgba, grade_pixel, hue_rotate, ColorGrade};
pub use lut::{parse_cube_lut, CubeLut, LutError};
