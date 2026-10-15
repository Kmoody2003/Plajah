// components/tela/TelaImageSelectionOverlay.tsx
// Photoshop-grade interactive selection canvas overlay for Tela Image devices.
// Provides Rectangular/Elliptical Marquees, Freehand & Polygonal Lassos, Magic Wand,
// Meta SAM Select Subject, Generative Fill Inpaint Brush (B), Mask Eraser (E),
// Canvas Outpainting, animated marching ants, Inverse Selection, Feather/Expand/Contract,
// Generative Fill bridge, and Layer via Copy (Ctrl+J).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  FlipHorizontal,
  Maximize2,
  Sliders,
  Copy,
  Trash2,
  X,
  Layers,
  Wand2,
  Loader2,
  Check,
  ChevronDown,
  Paintbrush,
  Eraser,
  Plus,
  Minus
} from 'lucide-react';
import {
  Selection,
  SelectionOp,
  SelectionTool,
  emptySelection,
  selectAll,
  invertSelection,
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelection,
  borderSelection,
  rectSelection,
  ellipseSelection,
  lassoSelection,
  polygonalLassoSelection,
  magicWand,
  selectionToDataUrl,
  selectionToSvgPath,
  loadLayerAsBitmap8,
  layerViaCopy,
  deleteSelectedPixels,
  stampBrushCircle,
  stampBrushLine,
  recalculateSelectionBounds,
  refineSelectionHairAndFringes,
  selectSubjectWithHairMatting,
} from '../../services/tela/raster/selectionWorkflow';
import { executeGenerativeInpaint, executeGenerativeOutpaint } from '../../services/tela/telaInpaintService';
import { samSegmentationService, type PromptPoint } from '../../services/samSegmentationService';
import type { TelaImageLayer } from '../../types';

export interface TelaImageSelectionOverlayProps {
  width: number;
  height: number;
  activeLayer: TelaImageLayer | null;
  activeTool: SelectionTool;
  onToolChange?: (tool: SelectionTool) => void;
  selection: Selection | null;
  onSelectionChange: (selection: Selection | null) => void;
  onAddLayer?: (layer: TelaImageLayer) => void;
  onUpdateLayer?: (layerId: string, patch: Partial<TelaImageLayer>) => void;
  interactionScale?: number;
}

export const TelaImageSelectionOverlay: React.FC<TelaImageSelectionOverlayProps> = ({
  width,
  height,
  activeLayer,
  activeTool,
  onToolChange,
  selection,
  onSelectionChange,
  onAddLayer,
  onUpdateLayer,
  interactionScale = 1,
}) => {
  const [opMode, setOpMode] = useState<SelectionOp>('replace');
  const [antOffset, setAntOffset] = useState(0);
  const [brushSize, setBrushSize] = useState<number>(36);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const [dragState, setDragState] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    polyPoints?: { x: number; y: number }[];
    isBrush?: boolean;
    brushSelection?: Selection;
  } | null>(null);

  // Floating Contextual Bar state
  const [modifyMenuOpen, setModifyMenuOpen] = useState(false);
  const [outpaintMenuOpen, setOutpaintMenuOpen] = useState(false);
  const [modifyType, setModifyType] = useState<'feather' | 'expand' | 'contract' | 'smooth' | 'border' | null>(null);
  const [modifyValue, setModifyValue] = useState(10);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintBusy, setInpaintBusy] = useState(false);
  const [inpaintMsg, setInpaintMsg] = useState<string | null>(null);
  const [wandTolerance, setWandTolerance] = useState(32);

  // Animated marching ants ticker
  useEffect(() => {
    if (!selection || !selection.bounds) return;
    let animId: number;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 60) {
        last = now;
        setAntOffset((v) => (v + 1) % 8);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [selection]);

  // Compute marching ants path
  const svgAntPath = React.useMemo(() => {
    return selectionToSvgPath(selection);
  }, [selection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
        return;
      }

      // [ / ] -> Brush Size adjustments
      if (e.key === '[') {
        e.preventDefault();
        setBrushSize((s) => Math.max(4, s - 4));
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setBrushSize((s) => Math.min(200, s + 4));
        return;
      }

      // B -> Inpaint Brush
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onToolChange?.(activeTool === 'brush_inpaint' ? 'none' : 'brush_inpaint');
        return;
      }

      // E -> Mask Eraser
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onToolChange?.(activeTool === 'brush_erase' ? 'none' : 'brush_erase');
        return;
      }

      // Ctrl+Shift+I / Cmd+Shift+I -> Inverse Selection
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        e.stopPropagation();
        handleInverse();
        return;
      }

      // Ctrl+D / Cmd+D -> Deselect
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        handleDeselect();
        return;
      }

      // Ctrl+A / Cmd+A -> Select All (when selection tool active)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && activeTool !== 'none') {
        e.preventDefault();
        e.stopPropagation();
        handleSelectAll();
        return;
      }

      // Ctrl+J / Cmd+J -> Layer via Copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        void handleLayerViaCopy();
        return;
      }

      // Delete / Backspace -> Clear selected pixels
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.bounds && activeLayer) {
        e.preventDefault();
        e.stopPropagation();
        void handleDeletePixels();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, activeLayer, width, height, activeTool, onToolChange]);

  // Operations
  const handleInverse = useCallback(() => {
    if (!selection || !selection.bounds) {
      onSelectionChange(selectAll(width, height));
      return;
    }
    const inv = invertSelection(selection);
    onSelectionChange(inv);
  }, [selection, width, height, onSelectionChange]);

  const handleDeselect = useCallback(() => {
    onSelectionChange(null);
    setDragState(null);
    setModifyType(null);
  }, [onSelectionChange]);

  const handleSelectAll = useCallback(() => {
    onSelectionChange(selectAll(width, height));
  }, [width, height, onSelectionChange]);

  const applyModification = useCallback(() => {
    if (!selection) return;
    let next = selection;
    if (modifyType === 'feather') {
      next = featherSelection(selection, modifyValue);
    } else if (modifyType === 'expand') {
      next = expandSelection(selection, modifyValue);
    } else if (modifyType === 'contract') {
      next = contractSelection(selection, modifyValue);
    } else if (modifyType === 'smooth') {
      next = smoothSelection(selection, modifyValue);
    } else if (modifyType === 'border') {
      next = borderSelection(selection, modifyValue);
    }
    onSelectionChange(next);
    setModifyType(null);
  }, [selection, modifyType, modifyValue, onSelectionChange]);

  const handleLayerViaCopy = useCallback(async () => {
    if (!selection || !activeLayer || !onAddLayer) return;
    try {
      const copy = await layerViaCopy(activeLayer, selection, width, height);
      if (copy) {
        onAddLayer(copy);
      }
    } catch (err) {
      console.error('[Tela Selection] Failed to create layer via copy:', err);
    }
  }, [selection, activeLayer, width, height, onAddLayer]);

  const handleDeletePixels = useCallback(async () => {
    if (!selection || !activeLayer || !onUpdateLayer) return;
    try {
      const updatedSrc = await deleteSelectedPixels(activeLayer, selection, width, height);
      if (updatedSrc) {
        onUpdateLayer(activeLayer.id, { src: updatedSrc });
      }
    } catch (err) {
      console.error('[Tela Selection] Failed to delete selected pixels:', err);
    }
  }, [selection, activeLayer, width, height, onUpdateLayer]);

  const handleMaskFromSelection = useCallback(() => {
    if (!selection || !activeLayer || !onUpdateLayer) return;
    const maskUrl = selectionToDataUrl(selection, 'alpha');
    onUpdateLayer(activeLayer.id, {
      mask: {
        kind: 'ALPHA_IMAGE',
        enabled: true,
        src: maskUrl,
        invert: false,
      },
    });
  }, [selection, activeLayer, onUpdateLayer]);

  const handleGenerativeFill = useCallback(async (customPrompt?: string) => {
    if (!selection || !activeLayer?.src) return;
    setInpaintBusy(true);
    setInpaintMsg('Synthesizing with NVIDIA RTX GPU Sidecar…');
    try {
      const promptToUse = (typeof customPrompt === 'string' ? customPrompt : inpaintPrompt).trim();
      const maskDataUrl = selectionToDataUrl(selection, 'black-white');
      const res = await executeGenerativeInpaint(
        {
          sourceImageUrl: activeLayer.src,
          maskDataUrl,
          prompt: promptToUse || 'Seamless natural texture and environment, harmonious lighting',
          featherRadius: 8,
        },
        { width, height }
      );
      if (res?.newLayer) {
        if (onAddLayer) {
          onAddLayer(res.newLayer);
        } else if (onUpdateLayer) {
          onUpdateLayer(activeLayer.id, { ...res.newLayer });
        }
        setInpaintMsg(`Fill complete (${res.engine || 'local GPU'}) in ${res.ms || 0}ms`);
        setTimeout(() => setInpaintMsg(null), 3000);
      }
    } catch (err: any) {
      setInpaintMsg(`Fill failed: ${err.message || 'error'}`);
      setTimeout(() => setInpaintMsg(null), 3500);
    } finally {
      setInpaintBusy(false);
    }
  }, [selection, activeLayer, inpaintPrompt, width, height, onAddLayer, onUpdateLayer]);

  const samPointsRef = useRef<PromptPoint[]>([]);

  const handleGenerativeOutpaint = useCallback(async (outpaint: { left: number; top: number; right: number; bottom: number }) => {
    if (!activeLayer?.src) return;
    setInpaintBusy(true);
    setOutpaintMenuOpen(false);
    setInpaintMsg('Scene-reasoning & outpainting canvas…');
    try {
      const prompt = inpaintPrompt.trim() || 'Extended panoramic scenery, continuous environment, seamless background, highly detailed';
      const res = await executeGenerativeOutpaint(
        {
          sourceImageUrl: activeLayer.src,
          outpaint,
          prompt,
        },
        { width, height }
      );

      if (res?.newLayer) {
        if (onAddLayer) {
          onAddLayer(res.newLayer);
        } else if (onUpdateLayer) {
          onUpdateLayer(activeLayer.id, { ...res.newLayer });
        }
        setInpaintMsg(`Outpaint complete (${res.engine || 'scene-reasoned'}) in ${res.ms || 0}ms`);
        setTimeout(() => setInpaintMsg(null), 3000);
      }
    } catch (err: any) {
      setInpaintMsg(`Outpaint failed: ${err.message || 'error'}`);
      setTimeout(() => setInpaintMsg(null), 3500);
    } finally {
      setInpaintBusy(false);
    }
  }, [activeLayer, inpaintPrompt, width, height, onAddLayer, onUpdateLayer]);

  const handleSelectSubject = useCallback(async (
    points?: PromptPoint[],
    box?: { x1: number; y1: number; x2: number; y2: number }
  ) => {
    if (!activeLayer?.src) return;
    setInpaintBusy(true);
    setInpaintMsg('Isolating subject + hair, fringes & pass-through gaps…');
    try {
      const res = await selectSubjectWithHairMatting(activeLayer, width, height, {
        points: points && points.length > 0 ? points : [{ x: 0.5, y: 0.5, label: 1 }],
        box,
        hairFringeRadius: 20,
        passThroughSensitivity: 0.78,
        decontaminateColors: 0.92,
      });
      if (res?.selection) {
        onSelectionChange(res.selection);
        const m = res.metrics;
        const detailMsg = m
          ? `Subject matted: ${m.hairFringePixelsDetected} hair/fringe px · ${m.passThroughHolesPunched} pass-through gaps removed (${m.processingTimeMs}ms)`
          : 'Subject matted with hair & fringe isolation';
        setInpaintMsg(detailMsg);
        setTimeout(() => setInpaintMsg(null), 3200);
      }
    } catch (err: any) {
      setInpaintMsg(`Subject selection failed: ${err.message}`);
      setTimeout(() => setInpaintMsg(null), 3000);
    } finally {
      setInpaintBusy(false);
    }
  }, [activeLayer, width, height, onSelectionChange]);

  const handleRefineHairAndFringes = useCallback(async () => {
    if (!selection || !activeLayer) return;
    setInpaintBusy(true);
    setInpaintMsg('Refining hair strands, fabric fringes & punching pass-through background…');
    try {
      const res = await refineSelectionHairAndFringes(activeLayer, selection, width, height, {
        hairFringeRadius: 22,
        passThroughSensitivity: 0.80,
        decontaminateColors: 0.92,
      });
      if (res?.selection) {
        onSelectionChange(res.selection);
        const m = res.metrics;
        setInpaintMsg(
          `Refined: ${m.hairFringePixelsDetected} hair/fringe px · ${m.passThroughHolesPunched} pass-through gaps · ${m.decontaminatedEdgePixels} de-spilled (${m.processingTimeMs}ms)`
        );
        setTimeout(() => setInpaintMsg(null), 3500);
      }
    } catch (err: any) {
      setInpaintMsg(`Hair refinement failed: ${err.message}`);
      setTimeout(() => setInpaintMsg(null), 3000);
    } finally {
      setInpaintBusy(false);
    }
  }, [selection, activeLayer, width, height, onSelectionChange]);

  // Pointer interactions on canvas
  const getCanvasCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, (e.clientX - rect.left) / interactionScale));
    const y = Math.max(0, Math.min(height, (e.clientY - rect.top) / interactionScale));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'none') return;
    if (e.button !== 0) return; // primary click only

    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    const { x, y } = getCanvasCoords(e);
    setCursorPos({ x, y });

    // Inpaint Brush or Mask Eraser
    if (activeTool === 'brush_inpaint' || activeTool === 'brush_erase') {
      const isErase = activeTool === 'brush_erase';
      const baseSel: Selection = selection
        ? { width, height, data: new Uint8Array(selection.data), bounds: selection.bounds }
        : emptySelection(width, height);
      stampBrushCircle(baseSel, x, y, brushSize, isErase ? 0 : 255);
      recalculateSelectionBounds(baseSel);
      onSelectionChange(baseSel);
      setDragState({
        active: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        isBrush: true,
        brushSelection: baseSel,
      });
      return;
    }

    if (activeTool === 'magic_wand') {
      if (!activeLayer?.src) return;
      void (async () => {
        try {
          const bm = await loadLayerAsBitmap8(activeLayer.src, width, height);
          const wandSel = magicWand(bm, x, y, {
            tolerance: wandTolerance,
            contiguous: true,
            antiAlias: true,
          });
          onSelectionChange(wandSel);
        } catch (err) {
          console.error('[Magic Wand] Error executing wand:', err);
        }
      })();
      return;
    }

    if (activeTool === 'lasso_poly') {
      const existing = dragState?.polyPoints || [];
      const newPoints = [...existing, { x, y }];
      setDragState({
        active: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        polyPoints: newPoints,
      });
      return;
    }

    setDragState({
      active: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      polyPoints: activeTool === 'lasso_free' ? [{ x, y }] : undefined,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = getCanvasCoords(e);
    setCursorPos({ x, y });

    if (!dragState || !dragState.active) return;

    if (dragState.isBrush && dragState.brushSelection) {
      const isErase = activeTool === 'brush_erase';
      stampBrushLine(dragState.brushSelection, dragState.currentX, dragState.currentY, x, y, brushSize, isErase ? 0 : 255);
      recalculateSelectionBounds(dragState.brushSelection);
      onSelectionChange({ ...dragState.brushSelection });
      setDragState({
        ...dragState,
        currentX: x,
        currentY: y,
      });
      return;
    }

    if (activeTool === 'lasso_free') {
      const pts = dragState.polyPoints ? [...dragState.polyPoints, { x, y }] : [{ x, y }];
      setDragState({
        ...dragState,
        currentX: x,
        currentY: y,
        polyPoints: pts,
      });
      return;
    }

    setDragState({
      ...dragState,
      currentX: x,
      currentY: y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || !dragState.active) return;

    if (dragState.isBrush) {
      if (dragState.brushSelection) {
        recalculateSelectionBounds(dragState.brushSelection);
        onSelectionChange({ ...dragState.brushSelection });
      }
      setDragState(null);
      return;
    }

    if (activeTool === 'lasso_poly') return; // polygon lasso completes on double click or manual close

    const { startX, startY, currentX, currentY } = dragState;
    const rectX = Math.min(startX, currentX);
    const rectY = Math.min(startY, currentY);
    const rectW = Math.abs(currentX - startX);
    const rectH = Math.abs(currentY - startY);

    if (activeTool === 'select_subject' || activeTool === 'quick_select') {
      setDragState(null);
      if (rectW > 10 && rectH > 10) {
        // User dragged an object bounding box -> segment object inside box with hair/fringe matting
        const box = {
          x1: rectX / width,
          y1: rectY / height,
          x2: (rectX + rectW) / width,
          y2: (rectY + rectH) / height,
        };
        const cx = (box.x1 + box.x2) * 0.5;
        const cy = (box.y1 + box.y2) * 0.5;
        samPointsRef.current = [{ x: cx, y: cy, label: 1 }];
        void handleSelectSubject(samPointsRef.current, box);
      } else {
        // User clicked a point -> Shift+click adds positive point, Alt+click adds negative exclusion point
        const pt: PromptPoint = {
          x: currentX / width,
          y: currentY / height,
          label: e.altKey ? 0 : 1,
        };
        if (e.shiftKey || e.altKey) {
          samPointsRef.current = [...samPointsRef.current, pt];
        } else {
          samPointsRef.current = [pt];
        }
        void handleSelectSubject(samPointsRef.current);
      }
      return;
    }

    let nextSel: Selection | null = null;

    if (activeTool === 'marquee_rect' && rectW > 3 && rectH > 3) {
      nextSel = rectSelection(width, height, { x: rectX, y: rectY, width: rectW, height: rectH });
    } else if (activeTool === 'marquee_ellipse' && rectW > 3 && rectH > 3) {
      nextSel = ellipseSelection(width, height, { x: rectX, y: rectY, width: rectW, height: rectH });
    } else if (activeTool === 'lasso_free' && dragState.polyPoints && dragState.polyPoints.length > 3) {
      nextSel = lassoSelection(width, height, dragState.polyPoints);
    }

    if (nextSel) {
      onSelectionChange(nextSel);
    }

    setDragState(null);
  };

  const handleDoubleClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'lasso_poly' && dragState?.polyPoints && dragState.polyPoints.length > 2) {
      const polySel = polygonalLassoSelection(width, height, dragState.polyPoints);
      onSelectionChange(polySel);
      setDragState(null);
    }
  };

  // Preview box while dragging
  const dragPreview = dragState?.active && activeTool !== 'none' && (() => {
    if (activeTool === 'marquee_rect' || activeTool === 'select_subject' || activeTool === 'quick_select') {
      const x = Math.min(dragState.startX, dragState.currentX);
      const y = Math.min(dragState.startY, dragState.currentY);
      const w = Math.abs(dragState.currentX - dragState.startX);
      const h = Math.abs(dragState.currentY - dragState.startY);
      const isObj = activeTool === 'select_subject' || activeTool === 'quick_select';
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={isObj ? 'rgba(181, 108, 255, 0.14)' : 'rgba(0, 218, 243, 0.12)'}
          stroke={isObj ? '#b56cff' : '#00DAF3'}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      );
    }
    if (activeTool === 'marquee_ellipse') {
      const x = Math.min(dragState.startX, dragState.currentX);
      const y = Math.min(dragState.startY, dragState.currentY);
      const w = Math.abs(dragState.currentX - dragState.startX);
      const h = Math.abs(dragState.currentY - dragState.startY);
      return (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill="rgba(0, 218, 243, 0.12)"
          stroke="#00DAF3"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      );
    }
    if (activeTool === 'lasso_free' && dragState.polyPoints && dragState.polyPoints.length > 1) {
      const pts = dragState.polyPoints.map((p) => `${p.x},${p.y}`).join(' ');
      return (
        <polyline
          points={pts}
          fill="none"
          stroke="#00DAF3"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      );
    }
    if (activeTool === 'lasso_poly' && dragState.polyPoints && dragState.polyPoints.length > 0) {
      const pts = dragState.polyPoints.map((p) => `${p.x},${p.y}`).join(' ');
      return (
        <g>
          <polyline
            points={`${pts} ${dragState.currentX},${dragState.currentY}`}
            fill="rgba(0, 218, 243, 0.08)"
            stroke="#00DAF3"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          {dragState.polyPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#00DAF3" strokeWidth={1} />
          ))}
        </g>
      );
    }
    return null;
  })();

  const isSelectionActive = Boolean(selection?.bounds);
  const isBrushTool = activeTool === 'brush_inpaint' || activeTool === 'brush_erase';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        pointerEvents: activeTool !== 'none' || isSelectionActive ? 'auto' : 'none',
        zIndex: 25,
      }}
      onPointerEnter={(e) => setCursorPos(getCanvasCoords(e))}
      onPointerLeave={() => setCursorPos(null)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick as any}
    >
      {/* SVG Canvas for Marching Ants, Brush Cursor & Drag Marquee */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {/* Live Ruby Mask Overlay for Active Brush Painting (Photoshop Quick Mask / Firefly style) */}
        {svgAntPath && isBrushTool && (
          <path
            d={svgAntPath}
            fill="rgba(239, 68, 68, 0.28)"
            pointerEvents="none"
          />
        )}

        {/* Animated Marching Ants for Active Selection */}
        {svgAntPath && (
          <g>
            {/* White base dash */}
            <path
              d={svgAntPath}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1}
              strokeDasharray="4 4"
              strokeDashoffset={antOffset}
            />
            {/* Black overlay dash offset by 4 for high-contrast visibility */}
            <path
              d={svgAntPath}
              fill="none"
              stroke="#000000"
              strokeWidth={1}
              strokeDasharray="4 4"
              strokeDashoffset={antOffset + 4}
            />
          </g>
        )}

        {/* Real-time brush circumference cursor preview */}
        {isBrushTool && cursorPos && (
          <circle
            cx={cursorPos.x}
            cy={cursorPos.y}
            r={brushSize}
            fill={activeTool === 'brush_inpaint' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.15)'}
            stroke={activeTool === 'brush_inpaint' ? '#ef4444' : '#ffffff'}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}

        {/* Real-time drag marquee preview */}
        {dragPreview}
      </svg>

      {/* Floating Photoshop-Grade Selection Contextual Taskbar */}
      {isSelectionActive && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            background: 'rgba(18, 14, 28, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,218,243,0.3)',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backdropFilter: 'blur(12px)',
            color: '#fff',
            fontSize: 11,
            zIndex: 40,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Inverse Selection Button (Ctrl+Shift+I) */}
          <button
            onClick={handleInverse}
            title="Inverse Selection (Ctrl+Shift+I) — Invert selected area"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(0, 218, 243, 0.35)',
              background: 'rgba(0, 218, 243, 0.12)',
              color: '#8ff5ff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <FlipHorizontal size={14} />
            <span>Inverse</span>
          </button>

          {/* Refine Hair & Fringes + Pass-Through Hole Punching Button */}
          <button
            onClick={() => void handleRefineHairAndFringes()}
            disabled={inpaintBusy}
            title="Compositing Alpha Matting: Isolate fine hair strands & fabric fringes, punch out background pass-through between strands, and decontaminate edge colors"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(181, 108, 255, 0.45)',
              background: 'linear-gradient(135deg, rgba(181,108,255,0.22), rgba(212,0,85,0.22))',
              color: '#f3e8ff',
              fontWeight: 700,
              cursor: inpaintBusy ? 'wait' : 'pointer',
            }}
          >
            <Wand2 size={13} />
            <span>Refine Hair & Fringes</span>
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

          {/* Brush Controls if brush active */}
          {isBrushTool && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px' }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Size:</span>
              <button
                onClick={() => setBrushSize((s) => Math.max(4, s - 4))}
                title="Decrease Brush Size ([)"
                style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Minus size={11} />
              </button>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#00DAF3', minWidth: 26, textAlign: 'center' }}>
                {brushSize}px
              </span>
              <button
                onClick={() => setBrushSize((s) => Math.min(200, s + 4))}
                title="Increase Brush Size (])"
                style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Plus size={11} />
              </button>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
            </div>
          )}

          {/* Modify Dropdown (Feather / Expand / Contract / Smooth / Border) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setModifyMenuOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 9px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <Sliders size={13} />
              <span>Modify</span>
              <ChevronDown size={11} className="opacity-60" />
            </button>

            {modifyMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  left: 0,
                  minWidth: 160,
                  background: '#1a1426',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  padding: 4,
                  boxShadow: '0 12px 35px rgba(0,0,0,0.7)',
                  zIndex: 50,
                }}
                onMouseLeave={() => setModifyMenuOpen(false)}
              >
                {(['feather', 'expand', 'contract', 'smooth', 'border'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setModifyType(t);
                      setModifyMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {t} Selection…
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Modify Slider Popup if active */}
          {modifyType && (
            <div
              style={{
                position: 'absolute',
                bottom: '120%',
                left: '20%',
                background: '#1a1426',
                border: '1px solid rgba(0, 218, 243, 0.4)',
                borderRadius: 10,
                padding: '10px 14px',
                boxShadow: '0 15px 40px rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                zIndex: 55,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', color: '#00DAF3' }}>
                {modifyType}: {modifyValue}px
              </span>
              <input
                type="range"
                min={1}
                max={80}
                value={modifyValue}
                onChange={(e) => setModifyValue(+e.target.value)}
                style={{ width: 100, accentColor: '#00DAF3' }}
              />
              <button
                onClick={applyModification}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#00DAF3',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
              <button
                onClick={() => setModifyType(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Generative Fill Prompt & Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder="Generative Fill prompt…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleGenerativeFill();
              }}
              style={{
                width: 150,
                height: 26,
                padding: '0 8px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 10,
                outline: 'none',
              }}
            />

            {/* Quick 1-Click Remove Object */}
            <button
              onClick={() => void handleGenerativeFill('Clean empty background texture, remove object, seamless natural continuity')}
              disabled={inpaintBusy}
              title="1-Click Remove / Erase Object"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 8px',
                borderRadius: 7,
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                fontWeight: 700,
                fontSize: 10,
                cursor: inpaintBusy ? 'wait' : 'pointer',
              }}
            >
              <Trash2 size={11} />
              <span>Remove</span>
            </button>

            {/* Generative Fill Button */}
            <button
              onClick={() => void handleGenerativeFill()}
              disabled={inpaintBusy}
              title="Generative Fill selection using NVIDIA RTX GPU"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 7,
                border: 'none',
                background: 'linear-gradient(135deg, #00DAF3, #6B0099)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 10,
                cursor: inpaintBusy ? 'wait' : 'pointer',
              }}
            >
              {inpaintBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>{inpaintBusy ? 'Filling…' : 'Generate'}</span>
            </button>
          </div>

          {/* Outpaint Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOutpaintMenuOpen((v) => !v)}
              disabled={inpaintBusy}
              title="Generative Outpaint & Canvas Expand"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 8px',
                borderRadius: 7,
                border: '1px solid rgba(0, 218, 243, 0.3)',
                background: 'rgba(0, 218, 243, 0.08)',
                color: '#8ff5ff',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Maximize2 size={12} />
              <span>Outpaint</span>
              <ChevronDown size={10} className="opacity-60" />
            </button>

            {outpaintMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  right: 0,
                  minWidth: 170,
                  background: '#1a1426',
                  border: '1px solid rgba(0, 218, 243, 0.35)',
                  borderRadius: 10,
                  padding: 4,
                  boxShadow: '0 12px 35px rgba(0,0,0,0.75)',
                  zIndex: 50,
                }}
                onMouseLeave={() => setOutpaintMenuOpen(false)}
              >
                <button
                  onClick={() => handleGenerativeOutpaint({ left: Math.round(width * 0.15), top: Math.round(height * 0.15), right: Math.round(width * 0.15), bottom: Math.round(height * 0.15) })}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,218,243,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Expand Canvas +25% (All Sides)
                </button>
                <button
                  onClick={() => handleGenerativeOutpaint({ left: Math.round(width * 0.25), top: 0, right: Math.round(width * 0.25), bottom: 0 })}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,218,243,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Panorama +50% (Left & Right)
                </button>
                <button
                  onClick={() => handleGenerativeOutpaint({ left: 0, top: Math.round(height * 0.25), right: 0, bottom: Math.round(height * 0.25) })}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,218,243,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Portrait +50% (Top & Bottom)
                </button>
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

          {/* Layer via Copy (Ctrl+J) */}
          <button
            onClick={() => void handleLayerViaCopy()}
            title="Layer via Copy (Ctrl+J) — Extract selection to new layer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 8px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Copy size={12} />
            <span>Copy (Ctrl+J)</span>
          </button>

          {/* Layer Mask */}
          <button
            onClick={handleMaskFromSelection}
            title="Add Layer Mask from Selection"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 8px',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Layers size={12} />
            <span>Mask</span>
          </button>

          {/* Deselect */}
          <button
            onClick={handleDeselect}
            title="Deselect (Ctrl+D)"
            style={{
              padding: '5px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Floating Status Notification */}
      {inpaintMsg && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid #00DAF3',
            color: '#8ff5ff',
            padding: '5px 14px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 60,
          }}
        >
          {inpaintMsg}
        </div>
      )}
    </div>
  );
};

export default TelaImageSelectionOverlay;
