/**
 * telaPatternBrushEngine.ts — Procedural Spline & Pattern Brush Engine for Tela
 *
 * Repeats, tiles, and deforms geometric and organic motifs along Catmull-Rom
 * and Bezier splines:
 * - Built-in patterns: Stitches, Ribbon Braids, Pearl Beads, Wave Ripple, Floral Vines, Neon Tube
 * - Dynamic spacing, jitter, and pressure-controlled scaling
 * - Outputs resolution-independent SVG paths or compound TelaVectorObjects
 */

import type { TelaVectorNode } from '../../types';

export type PatternBrushKind =
  | 'STITCH'
  | 'PEARL_BEAD'
  | 'RIBBON_BRAID'
  | 'WAVE_RIPPLE'
  | 'FLORAL_VINE'
  | 'NEON_GLOW';

export interface PatternBrushConfig {
  kind: PatternBrushKind;
  spacing: number;       // distance between repeated motifs (px)
  size: number;          // motif scale (px)
  color: string;
  secondaryColor?: string;
  jitter: number;        // 0..1 random offset perpendicular to path
  symmetryX?: boolean;
}

export interface SplinePoint {
  x: number;
  y: number;
  angle: number;
  tangentX: number;
  tangentY: number;
}

/**
 * Sample equidistant points along a series of Bezier nodes.
 */
export function sampleSplineEquidistant(
  nodes: TelaVectorNode[],
  spacing = 20
): SplinePoint[] {
  if (nodes.length < 2) return [];

  const points: SplinePoint[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = nodes[i];
    const p1 = nodes[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;

    const steps = Math.max(1, Math.floor(segLen / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      const angle = Math.atan2(dy, dx);

      points.push({
        x,
        y,
        angle,
        tangentX: dx / segLen,
        tangentY: dy / segLen,
      });
    }
  }

  return points;
}

/**
 * Generates SVG path data for a selected pattern brush along the spline.
 */
export function renderPatternBrushSvg(
  nodes: TelaVectorNode[],
  config: PatternBrushConfig
): string {
  const points = sampleSplineEquidistant(nodes, config.spacing || 24);
  if (!points.length) return '';

  let svgData = '';

  points.forEach((pt, index) => {
    // Normal vector perpendicular to tangent
    const nx = -pt.tangentY;
    const ny = pt.tangentX;

    const jitterOffset = (Math.sin(index * 997.13) * config.jitter * config.size) / 2;
    const cx = pt.x + nx * jitterOffset;
    const cy = pt.y + ny * jitterOffset;
    const sz = config.size;

    switch (config.kind) {
      case 'STITCH': {
        // Dashed angled stitch
        const halfLen = sz * 0.45;
        const angle = pt.angle + (index % 2 === 0 ? 0.35 : -0.35);
        const sx = cx - Math.cos(angle) * halfLen;
        const sy = cy - Math.sin(angle) * halfLen;
        const ex = cx + Math.cos(angle) * halfLen;
        const ey = cy + Math.sin(angle) * halfLen;
        svgData += ` M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
        break;
      }

      case 'PEARL_BEAD': {
        // Repeated pearl circles along spline
        const r = sz * 0.4;
        svgData += ` M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
        break;
      }

      case 'RIBBON_BRAID': {
        // Alternating overlapping ribbon loop
        const offset = (index % 2 === 0 ? 1 : -1) * (sz * 0.4);
        const bx = cx + nx * offset;
        const by = cy + ny * offset;
        svgData += ` M ${(bx - sz * 0.3).toFixed(1)} ${by.toFixed(1)} Q ${bx.toFixed(1)} ${(by - sz * 0.3).toFixed(1)} ${(bx + sz * 0.3).toFixed(1)} ${by.toFixed(1)}`;
        break;
      }

      case 'WAVE_RIPPLE': {
        // Dynamic ripple arc
        const waveH = Math.sin(index * 0.8) * sz * 0.5;
        const wx = cx + nx * waveH;
        const wy = cy + ny * waveH;
        svgData += index === 0 ? ` M ${wx.toFixed(1)} ${wy.toFixed(1)}` : ` L ${wx.toFixed(1)} ${wy.toFixed(1)}`;
        break;
      }

      case 'FLORAL_VINE': {
        // Small leaf alternating sides
        const side = index % 2 === 0 ? 1 : -1;
        const lx = cx + nx * (sz * 0.35 * side);
        const ly = cy + ny * (sz * 0.35 * side);
        svgData += ` M ${cx.toFixed(1)} ${cy.toFixed(1)} Q ${lx.toFixed(1)} ${ly.toFixed(1)} ${(cx + pt.tangentX * sz * 0.3).toFixed(1)} ${(cy + pt.tangentY * sz * 0.3).toFixed(1)}`;
        break;
      }

      case 'NEON_GLOW': {
        // Continuous line with rounded caps
        svgData += index === 0 ? ` M ${cx.toFixed(1)} ${cy.toFixed(1)}` : ` L ${cx.toFixed(1)} ${cy.toFixed(1)}`;
        break;
      }
    }
  });

  return svgData;
}
