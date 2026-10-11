// The Studio editor's shared state: one context so the canvas, the control bar and every
// dock panel read the same device, selection, tool and preferences, and write through the
// same `commit` (one EDIT_VECTOR_DEVICE op = one undo step).
import { createContext, useContext } from 'react';
import type { TelaVectorDevice, TelaVectorObject } from '../../../types';
import type { TelaStudioDeviceExt } from '../../../services/tela/studio/model';
import type { AnchorRef } from '../../../services/tela/studio/direct';
import type { TextSystem } from '../../../services/text';

export type StudioTool =
  | 'select' | 'direct' | 'pen' | 'addAnchor' | 'deleteAnchor' | 'convert' | 'pencil' | 'scissors'
  | 'type' | 'typePath' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'spiral'
  | 'width' | 'shapeBuilder' | 'gradient' | 'mesh' | 'eyedropper' | 'artboard' | 'hand' | 'zoom' | 'rotate' | 'reflect' | 'scale';

export interface StudioPrefs {
  snapGrid: boolean; snapPoint: boolean; smartGuides: boolean; showGrid: boolean; gridSize: number;
  showRulers: boolean; showGuides: boolean; outline: boolean; previewBounds: boolean;
}
export interface PaintDefaults { fill: string; stroke: string; strokeWidth: number; focus: 'fill' | 'stroke' }
export interface ShapeOpts { sides: number; points: number; innerRatio: number; radius: number; spiralDecay: number; spiralSegments: number }

export interface CommitOpts { label?: string; coalesce?: string; studio?: TelaStudioDeviceExt; select?: string[]; size?: { width: number; height: number } }

export interface StudioApi {
  device: TelaVectorDevice;
  objects: TelaVectorObject[];
  studio: TelaStudioDeviceExt;
  readOnly: boolean;
  /** Latest device (after commits this tick) — use inside callbacks. */
  latest: () => TelaVectorDevice;
  commit: (after: TelaVectorObject[], o?: CommitOpts) => void;
  commitStudio: (studio: TelaStudioDeviceExt, label?: string) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  anchorSel: { id: string; refs: AnchorRef[] } | null;
  setAnchorSel: (s: { id: string; refs: AnchorRef[] } | null) => void;
  tool: StudioTool; setTool: (t: StudioTool) => void;
  isolation: string | null; setIsolation: (g: string | null) => void;
  zoom: number; setZoom: (z: number, focus?: { x: number; y: number }) => void;
  prefs: StudioPrefs; setPrefs: (p: Partial<StudioPrefs>) => void;
  paint: PaintDefaults; setPaint: (p: Partial<PaintDefaults>) => void;
  shapeOpts: ShapeOpts; setShapeOpts: (p: Partial<ShapeOpts>) => void;
  writerTexts?: Record<string, string>;
  /** Engine text (lazy). */
  text: () => Promise<TextSystem>;
  /** Re-compose a type object (and its thread) after its story or frame changed. */
  rebakeType: (headId: string, label?: string) => void;
  editingText: string | null; setEditingText: (id: string | null) => void;
  /** Gradient annotator / mesh node focus. */
  paintTarget: { kind: 'gradient' | 'mesh'; node?: number; stop?: number } | null;
  setPaintTarget: (t: { kind: 'gradient' | 'mesh'; node?: number; stop?: number } | null) => void;
  status: (msg: string) => void;
}

export const StudioCtx = createContext<StudioApi | null>(null);
export function useStudio(): StudioApi { const s = useContext(StudioCtx); if (!s) throw new Error('StudioCtx missing'); return s; }
