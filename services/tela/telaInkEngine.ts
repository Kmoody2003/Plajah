/**
 * telaInkEngine.ts — High-performance ink capture, streamline smoothing,
 * and curve fitting for Tela's dual-pen architecture:
 *
 * 1. Raw Ink Pen: Retains expressive pressure, tilt, and natural ink geometry.
 * 2. Smart Bezier Pen: Captures freehand gesture and automatically fits it into
 *    editable cubic Bezier curves (TelaVectorObject with pathNodes) upon release.
 */

import type { TelaVectorNode, TelaVectorObject } from '../../types';

export interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  time: number;
}

export interface RawStroke {
  id: string;
  points: InkPoint[];
  color: string;
  baseWidth: number;
  smoothing: number;
  blendMode?: string;
  timestamp: number;
}

/**
 * Exponential Moving Average (EMA) streamline filter to eliminate stylus jitter.
 */
export function streamlineSmooth(points: InkPoint[], factor = 0.65): InkPoint[] {
  if (points.length <= 2) return points;
  const smoothed: InkPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = smoothed[i - 1];
    const curr = points[i];
    const smoothedX = prev.x * factor + curr.x * (1 - factor);
    const smoothedY = prev.y * factor + curr.y * (1 - factor);
    const smoothedPressure = prev.pressure * factor + curr.pressure * (1 - factor);

    smoothed.push({
      x: smoothedX,
      y: smoothedY,
      pressure: smoothedPressure,
      tiltX: curr.tiltX,
      tiltY: curr.tiltY,
      time: curr.time,
    });
  }
  return smoothed;
}

/**
 * Convert ink stroke points into an SVG polygon ribbon taking pressure into account.
 */
export function strokeToSvgPath(points: InkPoint[], baseWidth = 3): string {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    const r = (baseWidth * (p.pressure || 0.5)) / 2;
    return `M ${p.x - r} ${p.y} A ${r} ${r} 0 1 0 ${p.x + r} ${p.y} A ${r} ${r} 0 1 0 ${p.x - r} ${p.y} Z`;
  }

  const leftPoints: { x: number; y: number }[] = [];
  const rightPoints: { x: number; y: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    let len = Math.hypot(dx, dy);
    if (len === 0) {
      dx = 1;
      dy = 0;
      len = 1;
    }

    // Normal vector perpendicular to tangent
    const nx = -dy / len;
    const ny = dx / len;

    const pressure = Math.max(0.15, Math.min(1.8, curr.pressure || 0.5));
    const halfWidth = (baseWidth * pressure) / 2;

    leftPoints.push({ x: curr.x + nx * halfWidth, y: curr.y + ny * halfWidth });
    rightPoints.push({ x: curr.x - nx * halfWidth, y: curr.y - ny * halfWidth });
  }

  // Construct ribbon contour: left side forward, right side backward
  let d = `M ${leftPoints[0].x.toFixed(1)} ${leftPoints[0].y.toFixed(1)}`;
  for (let i = 1; i < leftPoints.length; i++) {
    d += ` L ${leftPoints[i].x.toFixed(1)} ${leftPoints[i].y.toFixed(1)}`;
  }
  for (let i = rightPoints.length - 1; i >= 0; i--) {
    d += ` L ${rightPoints[i].x.toFixed(1)} ${rightPoints[i].y.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}

/**
 * Fit digitized points to a set of cubic Bezier nodes (Schneider-style curve fitting).
 * Auto-converts freehand hand-drawing directly into an editable TelaVectorObject.
 */
export function fitStrokeToBezierNodes(
  points: InkPoint[],
  tolerance = 4.0
): { nodes: TelaVectorNode[]; bounds: { x: number; y: number; w: number; h: number } } {
  if (points.length < 2) {
    const pt = points[0] || { x: 0, y: 0 };
    return {
      nodes: [{ id: `node_0_${Date.now()}`, x: pt.x, y: pt.y }],
      bounds: { x: pt.x - 2, y: pt.y - 2, w: 4, h: 4 },
    };
  }

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });

  // Subsample points according to chord distance tolerance
  const sampled: InkPoint[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const dist = Math.hypot(points[i].x - last.x, points[i].y - last.y);
    if (dist >= tolerance || i === points.length - 1) {
      sampled.push(points[i]);
      last = points[i];
    }
  }

  // Generate cubic Bezier nodes with smooth Catmull-Rom tangents converted to Bezier
  const nodes: TelaVectorNode[] = [];
  for (let i = 0; i < sampled.length; i++) {
    const curr = sampled[i];
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];

    // Tangent vectors using Catmull-Rom formulation
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;

    const node: TelaVectorNode = {
      id: `node_${i}_${Math.random().toString(36).slice(2, 7)}`,
      x: Math.round(curr.x * 10) / 10,
      y: Math.round(curr.y * 10) / 10,
    };

    if (i > 0) {
      node.inX = Math.round((curr.x - tx) * 10) / 10;
      node.inY = Math.round((curr.y - ty) * 10) / 10;
    }
    if (i < sampled.length - 1) {
      node.outX = Math.round((curr.x + tx) * 10) / 10;
      node.outY = Math.round((curr.y + ty) * 10) / 10;
    }

    nodes.push(node);
  }

  return {
    nodes,
    bounds: {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
    },
  };
}

/**
 * Creates a TelaVectorObject from an auto-converted stroke.
 */
export function makeBezierPathFromStroke(
  points: InkPoint[],
  color = '#6B0099',
  strokeWidth = 3,
  fill = 'none'
): TelaVectorObject {
  const smoothed = streamlineSmooth(points, 0.6);
  const { nodes, bounds } = fitStrokeToBezierNodes(smoothed, 3.5);

  const flatPoints: number[] = [];
  nodes.forEach(n => {
    flatPoints.push(n.x, n.y);
  });

  return {
    id: `vec_ink_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind: 'PATH',
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    points: flatPoints,
    pathNodes: nodes,
    pathClosed: false,
    fill,
    stroke: color,
    strokeWidth,
    rotation: 0,
    opacity: 1,
    objectLabel: 'Smart Bezier Ink',
    reconstructionLayer: 'ARTWORK',
  };
}
