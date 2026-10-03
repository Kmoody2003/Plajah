//! Plajah Math Core Engine
//!
//! Provides ultra-fast, zero-allocation, SIMD-ready mathematical routines for:
//! - Subpixel feature point tracking and patch correlation (`tracking`)
//! - Planar homography DLT solver, decomposition, and transformation (`planar`)

pub mod planar;
pub mod tracking;

pub use planar::{
    contain_box, decompose_planar, flip_y_mat3, invert_homography, is_identity_mat3,
    multiply_mat3, normalize_mat3, solve_homography, to_pixel_space, transform_point,
    unit_to_quad, Mat3, PlanarDecomposition, PlanarSolve, Point2, Quad, Rect,
    MAT3_IDENTITY, UNIT_QUAD,
};

pub use tracking::{
    gray_from_rgba, patch_error, patch_texture, track_point, GrayFrame, TrackPointResult,
};
