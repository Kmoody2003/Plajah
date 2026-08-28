// ═══════════════════════════════════════════════════════════════════════════
// gradeWindow — the power-window model. A window limits the whole per-clip grade
// (wheels + curves + qualifier) to a rect/ellipse region, so a correction lands
// only where you want it. Geometry is in UV space (0..1), origin top-left.
//
// The mask is evaluated in the compositor's grade stage (same live+export parity
// contract as curves/qualifier) — this module only carries the data model.
// ═══════════════════════════════════════════════════════════════════════════

export interface GradeWindow {
  shape: 'ellipse' | 'rect';
  x: number; y: number;   // centre (UV 0..1)
  w: number; h: number;   // half-extent (UV)
  feather: number;        // 0..1 soft edge
  invert?: boolean;       // grade OUTSIDE the shape instead
  enabled?: boolean;
}

export const WINDOW_DEFAULT: GradeWindow = {
  shape: 'ellipse', x: 0.5, y: 0.5, w: 0.3, h: 0.3, feather: 0.12, invert: false, enabled: true,
};

/** A window only does something when it exists and is enabled (it modulates an
 *  existing grade — a window with no grade is a no-op, handled by the caller). */
export function isWindowEnabled(win?: GradeWindow | null): boolean {
  return !!win && win.enabled !== false;
}
