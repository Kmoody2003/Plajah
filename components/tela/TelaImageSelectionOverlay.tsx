// components/tela/TelaImageSelectionOverlay.tsx
// Photoshop-grade interactive selection canvas overlay for Tela Image devices.
// Provides Rectangular/Elliptical Marquees, Freehand & Polygonal Lassos, Magic Wand,
// Meta SAM Select Subject, animated marching ants, Inverse Selection, Feather/Expand/Contract,
// Generative Fill bridge, and Layer via Copy (Ctrl+J).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Sliders,
  Copy,
  Trash2,
  X,
  Layers,
  Wand2,
  Loader2,
  Check,
  ChevronDown
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
} from '../../services/tela/raster/selectionWorkflow';
import { executeGenerativeInpaint } from '../../services/tela/telaInpaintService';
import { samSegmentationService } from '../../services/samSegmentationService';
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
  const [dragState, setDragState] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    polyPoints?: { x: number; y: number }[];
  } | null>(null);

  // Floating Contextual Bar state
  const [modifyMenuOpen, setModifyMenuOpen] = useState(false);
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
  }, [selection, activeLayer, width, height, activeTool]);

  // Operations
  const handleInverse = useCallback(() => {
    if (!selection || !selection.bounds) {
      // If nothing selected, inverting selects all
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
    const maskDataUrl = selectionToDataUrl(selection, 'alpha');
    onUpdateLayer(activeLayer.id, {
      mask: {
        kind: 'ALPHA_IMAGE',
        enabled: true,
        src: maskDataUrl,
        invert: false,
      },
    });
  }, [selection, activeLayer, onUpdateLayer]);

  const handleGenerativeFill = useCallback(async () => {
    if (!selection || !activeLayer?.src) return;
    setInpaintBusy(true);
    setInpaintMsg('Synthesizing with RTX GPU Sidecar…');
    try {
      const maskDataUrl = selectionToDataUrl(selection, 'black-white');
      const res = await executeGenerativeInpaint(
        {
          sourceImageUrl: activeLayer.src,
          maskDataUrl,
          prompt: inpaintPrompt.trim(),
        },
        { width, height }
      );
      if (res?.newLayer) {
        if (onAddLayer) {
          onAddLayer(res.newLayer);
        } else if (onUpdateLayer) {
          onUpdateLayer(activeLayer.id, { ...res.newLayer });
        }
        setInpaintMsg(`Fill complete (${res.engine || 'local'}) in ${res.ms || 0}ms`);
        setTimeout(() => setInpaintMsg(null), 3000);
      }
    } catch (err: any) {
      setInpaintMsg(`Fill failed: ${err.message || 'error'}`);
      setTimeout(() => setInpaintMsg(null), 3500);
    } finally {
      setInpaintBusy(false);
    }
  }, [selection, activeLayer, inpaintPrompt, width, height, onAddLayer, onUpdateLayer]);

  const handleSelectSubject = useCallback(async () => {
    if (!activeLayer?.src) return;
    setInpaintMsg('Meta SAM detecting subject…');
    try {
      const res = await samSegmentationService.segment(activeLayer.src, {
        points: [{ x: 0.5, y: 0.5, label: 1 }],
        feather: 0.005,
        invert: false,
      });
      if (res?.maskDataUrl) {
        const bm = await loadLayerAsBitmap8(res.maskDataUrl, width, height);
        const sel: Selection = {
          width,
          height,
          data: new Uint8Array(width * height),
          bounds: null,
        };
        for (let i = 0; i < width * height; i++) {
          sel.data[i] = bm.data[i * 4 + 3];
        }
        // compute bounds
        let x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (sel.data[y * width + x] > 20) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        sel.bounds = x1 >= 0 ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null;
        onSelectionChange(sel);
        setInpaintMsg('Subject selected');
        setTimeout(() => setInpaintMsg(null), 2000);
      }
    } catch (err: any) {
      setInpaintMsg(`Subject selection failed: ${err.message}`);
      setTimeout(() => setInpaintMsg(null), 3000);
    }
  }, [activeLayer, width, height, onSelectionChange]);

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

    // Modifier keys toggle mode
    let effectiveOp = opMode;
    if (e.shiftKey && !e.altKey) effectiveOp = 'add';
    else if (e.altKey && !e.shiftKey) effectiveOp = 'subtract';
    else if (e.shiftKey && e.altKey) effectiveOp = 'intersect';

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
          const merged = selection ? { ...wandSel } : wandSel;
          onSelectionChange(merged);
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
    if (!dragState || !dragState.active) return;
    const { x, y } = getCanvasCoords(e);

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
    if (activeTool === 'lasso_poly') return; // polygon lasso completes on double click or manual close

    const { startX, startY, currentX, currentY } = dragState;
    const rectX = Math.min(startX, currentX);
    const rectY = Math.min(startY, currentY);
    const rectW = Math.abs(currentX - startX);
    const rectH = Math.abs(currentY - startY);

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
    if (activeTool === 'marquee_rect') {
      const x = Math.min(dragState.startX, dragState.currentX);
      const y = Math.min(dragState.startY, dragState.currentY);
      const w = Math.abs(dragState.currentX - dragState.startX);
      const h = Math.abs(dragState.currentY - dragState.startY);
      return (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="rgba(0, 218, 243, 0.12)"
          stroke="#00DAF3"
          strokeWidth={1}
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

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        pointerEvents: activeTool !== 'none' ? 'auto' : 'none',
        zIndex: 25,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick as any}
    >
      {/* SVG Canvas for Marching Ants & In-Progress Drag Marquee */}
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
            background: 'rgba(18, 14, 28, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,0,85,0.3)',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backdropFilter: 'blur(10px)',
            color: '#fff',
            fontSize: 11,
            zIndex: 40,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Inverse Selection Button (The exact feature user requested!) */}
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
            <span>Inverse (Ctrl+Shift+I)</span>
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

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

          {/* Generative Fill Input & Trigger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder="Generative Fill prompt…"
              style={{
                width: 140,
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
            <button
              onClick={handleGenerativeFill}
              disabled={inpaintBusy}
              title="Generative Fill selection using NVIDIA RTX GPU"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 9px',
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
              <span>{inpaintBusy ? 'Filling…' : 'Fill'}</span>
            </button>
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
