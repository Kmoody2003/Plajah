// eyeGeometry.ts — eye positions from a FaceLandmarker landmark cloud (pure, worker-safe).
//
// Used by the lens engine (googly eyes). Kept dependency-free so the face worker and the main-thread
// fallback tracker can share one implementation and always agree on the numbers.
//
// MediaPipe's 478-point mesh indexes eyes by SUBJECT side; we only need "two eyes", so the pair is
// returned in subject-right, subject-left order and callers treat them symmetrically.

export interface EyeBox {
  /** Eye centre, normalized [0..1] in the detected frame. */
  cx: number; cy: number;
  /** Outer→inner corner vector, normalized. Convert with the frame's pixel size for a true length. */
  dx: number; dy: number;
  /** Lid opening ÷ eye width (≈0.3 open, →0 blinking). */
  open: number;
  /** Iris offset from the eye centre, in eye-widths (x right, y down). 0,0 = looking straight on. */
  gx: number; gy: number;
}
export interface MouthBox {
  cx: number; cy: number;
  /** Corner→corner vector, normalized (convert with the frame's pixel size for a true length). */
  dx: number; dy: number;
  /** Inner-lip gap ÷ mouth width (0 closed … ~0.6 wide open). */
  open: number;
}
export interface FaceEyes { eyes: [EyeBox, EyeBox]; mouth: MouthBox; bbox: { x: number; y: number; w: number; h: number } }

type P = { x: number; y: number };

// outer corner, inner corner, upper lid, lower lid
const RIGHT_EYE = [33, 133, 159, 145] as const;
const LEFT_EYE = [263, 362, 386, 374] as const;

function eye(lm: P[], [outer, inner, up, low]: readonly [number, number, number, number], iris: number, aspect: number): EyeBox | null {
  const o = lm[outer], i = lm[inner], u = lm[up], l = lm[low];
  if (!o || !i || !u || !l) return null;
  const dx = i.x - o.x, dy = i.y - o.y;
  // Lid gap and width in the same (pixel-proportional) units so `open` is aspect-correct.
  const width = Math.hypot(dx * aspect, dy) || 1e-6;
  const gap = Math.hypot((u.x - l.x) * aspect, u.y - l.y);
  const cx = (o.x + i.x + u.x + l.x) / 4, cy = (o.y + i.y + u.y + l.y) / 4;
  const ir = lm[iris];   // refined landmarks only (478-point mesh); absent → looking straight on
  return {
    cx, cy, dx, dy, open: Math.min(1, gap / width),
    gx: ir ? Math.max(-1, Math.min(1, ((ir.x - cx) * aspect) / width)) : 0,
    gy: ir ? Math.max(-1, Math.min(1, (ir.y - cy) / width)) : 0,
  };
}

// mouth corners (right, left), inner upper lip, inner lower lip
function mouth(lm: P[], aspect: number): MouthBox | null {
  const a = lm[61], b = lm[291], u = lm[13], l = lm[14];
  if (!a || !b || !u || !l) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const width = Math.hypot(dx * aspect, dy) || 1e-6;
  return {
    cx: (a.x + b.x + u.x + l.x) / 4, cy: (a.y + b.y + u.y + l.y) / 4, dx, dy,
    open: Math.min(1, Math.hypot((u.x - l.x) * aspect, u.y - l.y) / width),
  };
}

/** `aspect` = frame width ÷ height of the image the landmarks were detected on. */
export function facesFromLandmarks(all: P[][] | undefined, aspect: number): FaceEyes[] {
  const out: FaceEyes[] = [];
  for (const lm of all ?? []) {
    if (!lm || lm.length < 400) continue;
    const r = eye(lm, RIGHT_EYE, 468, aspect), l = eye(lm, LEFT_EYE, 473, aspect), m = mouth(lm, aspect);
    if (!r || !l || !m) continue;
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    out.push({ eyes: [r, l], mouth: m, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } });
  }
  return out;
}
