/**
 * Plajah ink — one pressure-aware drawing layer for the whole platform.
 * Strokes are Tela Vector PATH objects, so any drawing is a Tela document and embeds anywhere Tela renders.
 * Geometry (smoothing, pressure widths, hit-testing) lives in services/inkMath.
 */
export { default as InkLayer, type NoteTool } from './InkLayer';
export { default as InkStrokes, inkStrokesOf } from './InkStrokes';
export { default as InkPad } from './InkPad';
export type { InkStyle, InkPoint, Box } from '../../services/inkMath';
