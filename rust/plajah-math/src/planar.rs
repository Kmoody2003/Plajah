//! Planar homography mathematics for Fabula VectorTrack and Tela vector surfaces.
//!
//! Conventions:
//!   - Points are NORMALIZED image coordinates: x,y in 0.0..=1.0, origin TOP-LEFT, y DOWN.
//!   - A Mat3 is ROW-MAJOR [a,b,c, d,e,f, g,h,i] applying as (x',y',w') = M * (x,y,1).
//!   - A track sample's matrix maps REFERENCE-frame points -> CURRENT-frame points.

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Point2 {
    pub x: f64,
    pub y: f64,
}

impl Point2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

pub type Mat3 = [f64; 9];
pub type Quad = [Point2; 4];

pub const MAT3_IDENTITY: Mat3 = [
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,
];

pub const UNIT_QUAD: Quad = [
    Point2::new(0.0, 0.0), // TL
    Point2::new(1.0, 0.0), // TR
    Point2::new(1.0, 1.0), // BR
    Point2::new(0.0, 1.0), // BL
];

#[derive(Debug, Clone, PartialEq)]
pub struct PlanarSolve {
    pub matrix: Mat3,
    pub rms_error: f64,
    pub confidence: f64,
    pub corners: Quad,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlanarDecomposition {
    pub tx: f64,
    pub ty: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub shear: f64,
    pub perspective_x: f64,
    pub perspective_y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Gaussian elimination with partial pivoting solving A * x = b.
/// Matrix `a` is flattened n x n row-major, `b` has length n.
pub fn solve_linear(a: &[f64], b: &[f64], n: usize) -> Option<Vec<f64>> {
    let mut m = vec![0.0; n * (n + 1)];
    for r in 0..n {
        for c in 0..n {
            m[r * (n + 1) + c] = a[r * n + c];
        }
        m[r * (n + 1) + n] = b[r];
    }

    for c in 0..n {
        let mut pivot = c;
        let mut max_val = m[c * (n + 1) + c].abs();
        for r in (c + 1)..n {
            let val = m[r * (n + 1) + c].abs();
            if val > max_val {
                max_val = val;
                pivot = r;
            }
        }

        if pivot != c {
            for col in 0..=n {
                let tmp = m[c * (n + 1) + col];
                m[c * (n + 1) + col] = m[pivot * (n + 1) + col];
                m[pivot * (n + 1) + col] = tmp;
            }
        }

        let d = m[c * (n + 1) + c];
        if d.abs() < 1e-10 {
            return None;
        }

        let inv_d = 1.0 / d;
        for col in c..=n {
            m[c * (n + 1) + col] *= inv_d;
        }

        for r in 0..n {
            if r == c {
                continue;
            }
            let factor = m[r * (n + 1) + c];
            if factor != 0.0 {
                for col in c..=n {
                    m[r * (n + 1) + col] -= factor * m[c * (n + 1) + col];
                }
            }
        }
    }

    let mut result = Vec::with_capacity(n);
    for r in 0..n {
        result.push(m[r * (n + 1) + n]);
    }
    Some(result)
}

/// Projective point transformation by a 3x3 matrix: (x', y', w') = M * (x, y, 1).
#[inline]
pub fn transform_point(m: &Mat3, p: Point2) -> Point2 {
    let w = m[6] * p.x + m[7] * p.y + m[8];
    Point2 {
        x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
        y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
    }
}

/// Multiply two 3x3 matrices: a * b (applies b first, then a).
pub fn multiply_mat3(a: &Mat3, b: &Mat3) -> Mat3 {
    let mut o = [0.0; 9];
    for r in 0..3 {
        for c in 0..3 {
            o[r * 3 + c] = a[r * 3] * b[c]
                + a[r * 3 + 1] * b[3 + c]
                + a[r * 3 + 2] * b[6 + c];
        }
    }
    o
}

/// Scale so m[8] === 1.0 (a homography is defined up to scale).
pub fn normalize_mat3(m: &Mat3) -> Mat3 {
    let s = if m[8].abs() < 1e-12 { 1.0 } else { 1.0 / m[8] };
    let mut out = *m;
    for v in &mut out {
        *v *= s;
    }
    out
}

/// Check if a matrix is close to identity within an epsilon.
pub fn is_identity_mat3(m: &Mat3, eps: f64) -> bool {
    let n = normalize_mat3(m);
    for i in 0..9 {
        if (n[i] - MAT3_IDENTITY[i]).abs() > eps {
            return false;
        }
    }
    true
}

/// Exact/least-squares homography from four or more normalized correspondences.
pub fn solve_homography(from: &[Point2], to: &[Point2]) -> Option<PlanarSolve> {
    if from.len() != to.len() || from.len() < 4 {
        return None;
    }

    let n_pts = from.len();
    let num_rows = n_pts * 2;
    let mut rows = vec![[0.0; 8]; num_rows];
    let mut rhs = vec![0.0; num_rows];

    for (i, (&f, &t)) in from.iter().zip(to.iter()).enumerate() {
        let (x, y) = (f.x, f.y);
        let (u, v) = (t.x, t.y);
        rows[i * 2] = [x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y];
        rhs[i * 2] = u;
        rows[i * 2 + 1] = [0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y];
        rhs[i * 2 + 1] = v;
    }

    // Normal equations A^T * A * x = A^T * b (8x8 system)
    let mut ata = [0.0; 64];
    let mut atb = [0.0; 8];
    for r in 0..num_rows {
        let row = &rows[r];
        let b_val = rhs[r];
        for i in 0..8 {
            atb[i] += row[i] * b_val;
            for j in 0..8 {
                ata[i * 8 + j] += row[i] * row[j];
            }
        }
    }

    let q = solve_linear(&ata, &atb, 8)?;
    let matrix: Mat3 = [q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], 1.0];

    let mut err = 0.0;
    for i in 0..n_pts {
        let p = transform_point(&matrix, from[i]);
        let dx = p.x - to[i].x;
        let dy = p.y - to[i].y;
        err += dx * dx + dy * dy;
    }

    let rms_error = (err / n_pts as f64).sqrt();
    let confidence = (-rms_error * 40.0).exp();
    let corners: Quad = [
        transform_point(&matrix, UNIT_QUAD[0]),
        transform_point(&matrix, UNIT_QUAD[1]),
        transform_point(&matrix, UNIT_QUAD[2]),
        transform_point(&matrix, UNIT_QUAD[3]),
    ];

    Some(PlanarSolve {
        matrix,
        rms_error,
        confidence,
        corners,
    })
}

/// Homography that maps the unit square (TL, TR, BR, BL) onto `quad`.
pub fn unit_to_quad(quad: &Quad) -> Option<Mat3> {
    solve_homography(&UNIT_QUAD, quad).map(|s| s.matrix)
}

/// Analytic 3x3 matrix inverse using cofactor expansion.
pub fn invert_homography(m: &Mat3) -> Option<Mat3> {
    let [a, b, c, d, e, f, g, h, i] = *m;
    let big_a = e * i - f * h;
    let big_b = c * h - b * i;
    let big_c = b * f - c * e;
    let big_d = f * g - d * i;
    let big_e = a * i - c * g;
    let big_f = c * d - a * f;
    let big_g = d * h - e * g;
    let big_h = b * g - a * h;
    let big_i = a * e - b * d;

    let det = a * big_a + b * big_d + c * big_g;
    if det.abs() < 1e-10 {
        return None;
    }
    let inv_det = 1.0 / det;
    Some([
        big_a * inv_det, big_b * inv_det, big_c * inv_det,
        big_d * inv_det, big_e * inv_det, big_f * inv_det,
        big_g * inv_det, big_h * inv_det, big_i * inv_det,
    ])
}

/// Decompose the affine portion for ordinary Fabula transform binding.
pub fn decompose_planar(m: &Mat3) -> PlanarDecomposition {
    let tx = m[2];
    let ty = m[5];
    let scale_x = m[0].hypot(m[3]);
    let rotation = m[3].atan2(m[0]);
    let determinant = m[0] * m[4] - m[1] * m[3];
    let scale_y = determinant / 1e-9_f64.max(scale_x);
    let shear = (m[0] * m[1] + m[3] * m[4]) / 1e-9_f64.max(scale_x * scale_x);
    PlanarDecomposition {
        tx,
        ty,
        scale_x,
        scale_y,
        rotation,
        shear,
        perspective_x: m[6],
        perspective_y: m[7],
    }
}

/// Re-express a normalized-space matrix in a space where y runs UP (WebGL UVs).
pub fn flip_y_mat3(m: &Mat3) -> Mat3 {
    let f: Mat3 = [1.0, 0.0, 0.0, 0.0, -1.0, 1.0, 0.0, 0.0, 1.0];
    multiply_mat3(&f, &multiply_mat3(m, &f))
}

/// Re-express a normalized-space matrix in PIXEL space over a content box (x,y,w,h).
pub fn to_pixel_space(m: &Mat3, b: &Rect) -> Mat3 {
    let s: Mat3 = [b.w, 0.0, b.x, 0.0, b.h, b.y, 0.0, 0.0, 1.0];
    let inv_w = 1.0 / 1e-6_f64.max(b.w);
    let inv_h = 1.0 / 1e-6_f64.max(b.h);
    let si: Mat3 = [inv_w, 0.0, -b.x * inv_w, 0.0, inv_h, -b.y * inv_h, 0.0, 0.0, 1.0];
    multiply_mat3(&s, &multiply_mat3(m, &si))
}

/// Object-fit:contain box calculation for fitting `src` into `box`.
pub fn contain_box(src_w: f64, src_h: f64, box_w: f64, box_h: f64) -> Rect {
    if src_w <= 0.0 || src_h <= 0.0 || box_w <= 0.0 || box_h <= 0.0 {
        return Rect {
            x: 0.0,
            y: 0.0,
            w: 1.0_f64.max(box_w),
            h: 1.0_f64.max(box_h),
        };
    }
    let s = (box_w / src_w).min(box_h / src_h);
    let w = src_w * s;
    let h = src_h * s;
    Rect {
        x: (box_w - w) * 0.5,
        y: (box_h - h) * 0.5,
        w,
        h,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PTS: [Point2; 4] = [
        Point2::new(0.1, 0.1),
        Point2::new(0.8, 0.12),
        Point2::new(0.86, 0.78),
        Point2::new(0.08, 0.84),
    ];

    #[test]
    fn test_homography_recovery() {
        let truth: Mat3 = [1.1, 0.08, 0.04, -0.05, 0.92, 0.07, 0.12, -0.08, 1.0];
        let dst: Vec<Point2> = PTS.iter().map(|&p| transform_point(&truth, p)).collect();
        let solve = solve_homography(&PTS, &dst).expect("should solve");
        assert!(solve.rms_error < 1e-7);
        for i in 0..9 {
            assert!((solve.matrix[i] - truth[i]).abs() < 1e-6);
        }
        assert!(solve.confidence > 0.99);
    }

    #[test]
    fn test_inversion_and_decomposition() {
        let m: Mat3 = [1.2, 0.0, 0.1, 0.0, 1.2, -0.05, 0.0, 0.0, 1.0];
        let inv = invert_homography(&m).expect("should invert");
        let p = Point2::new(0.35, 0.6);
        let q = transform_point(&inv, transform_point(&m, p));
        assert!((q.x - p.x).abs() < 1e-9 && (q.y - p.y).abs() < 1e-9);

        let d = decompose_planar(&m);
        assert!((d.tx - 0.1).abs() < 1e-9);
        assert!((d.scale_x - 1.2).abs() < 1e-9);
    }

    #[test]
    fn test_matrix_composition_and_rebasing() {
        let a: Mat3 = [1.0, 0.0, 0.2, 0.0, 1.0, 0.1, 0.0, 0.0, 1.0];
        let b: Mat3 = [2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 1.0];
        let p = Point2::new(0.3, 0.4);
        let ab = transform_point(&multiply_mat3(&a, &b), p);
        let via_b = transform_point(&a, transform_point(&b, p));
        assert!((ab.x - via_b.x).abs() < 1e-12 && (ab.y - via_b.y).abs() < 1e-12);

        let f = flip_y_mat3(&a);
        let q = transform_point(&f, Point2::new(0.3, 0.6));
        assert!((q.x - 0.5).abs() < 1e-12 && (q.y - 0.5).abs() < 1e-12);

        let px = transform_point(
            &to_pixel_space(&a, &Rect { x: 10.0, y: 20.0, w: 200.0, h: 100.0 }),
            Point2::new(110.0, 70.0),
        );
        assert!((px.x - 150.0).abs() < 1e-9 && (px.y - 80.0).abs() < 1e-9);
    }

    #[test]
    fn test_unit_to_quad_and_contain_box() {
        let quad: Quad = [
            Point2::new(0.2, 0.2),
            Point2::new(0.8, 0.25),
            Point2::new(0.85, 0.8),
            Point2::new(0.15, 0.75),
        ];
        let q_mat = unit_to_quad(&quad).expect("quad mapping");
        let br = transform_point(&q_mat, Point2::new(1.0, 1.0));
        assert!((br.x - 0.85).abs() < 1e-9 && (br.y - 0.8).abs() < 1e-9);

        let c = contain_box(1920.0, 1080.0, 800.0, 800.0);
        assert_eq!(c, Rect { x: 0.0, y: 175.0, w: 800.0, h: 450.0 });
    }
}
