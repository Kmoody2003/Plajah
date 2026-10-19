import React, {
  useState, useRef, useCallback, useEffect,
} from 'react';
import { Stage, Layer, Rect, Image as KImage, Text, Group, Transformer, Path } from 'react-konva';
import Konva from 'konva';
import {
  MessageCircle, Zap, AlignLeft, AlignCenter, Trash2, Plus, Upload,
  Type, RotateCcw, Square, Sun, Moon, Palette, Move, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, X, LayoutGrid, Images, Loader2, Brush, BookOpen, Sparkles, Sliders, Hand, Layers, Check,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { StudioPage, StudioPanel, SpeechBubble } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../services/firebase';
import { layoutsFor, type ComicLayout, type LayoutPanelSpec } from '../data/comicLayouts';
import { parseScript, applyScriptToPage, charactersInScript, type ScriptCharacter } from '../services/comicScript';
import { takeComicHandoff } from '../services/comicHandoff';
import ComicDrawCanvas from './ComicDrawCanvas';
import { CouncilV4GraphicNovelStudioView } from './comic/CouncilV4GraphicNovelStudioView';
import {
  decomposeProseToComicBeatsAsync,
  requestStoryCouncilCritique,
  type StoryBreakdownResult,
  type StoryCouncilCritiqueResult,
} from '../services/comic/storyIntelligenceBridge';
import {
  transliterateActionToComicCaption,
  splitSpokenLineIntoComicClauses,
  computeSafeBalloonPlacement,
  analyzeImageElementForFaceAndActionSafeZones,
  COMIC_LETTERING_SAFE_ZONE_RULES,
  type SafeAnchorZone,
} from '../services/council/comicMangaCouncil';
import {
  sharedVideoPool,
  formatPanelTimecode,
  getPanelScrubBounds,
  clampLoopInOutPoints,
  createStillForPanelAtTimecode,
  savePanelOverrideById,
  getPanelOverrideById,
  MAX_TIMECODE_SCRUB_WINDOW_SECONDS,
  MAX_CINEMAGRAPH_LOOP_SECONDS,
} from '../services/comicVideoLoopEngine';

// ─── Non-Destructive Alt Text Layer Helpers ───────────────────────────────────

/** Resolve the currently active text for a speech bubble (Alt Layer vs. Original Script Version) */
export function getEffectiveBubbleText(b: SpeechBubble, panelMode?: 'alt' | 'script'): string {
  if (panelMode === 'script') {
    return b.originalScriptText ?? b.text ?? '';
  }
  if (b.useAltTextLayer && b.altText !== undefined) {
    return b.altText;
  }
  return b.text ?? b.originalScriptText ?? '';
}

/** Resolve the currently active caption for a panel (Alt Layer vs. Original Script Version) */
export function getEffectiveCaptionText(panel: StudioPanel): string | undefined {
  if (panel.textLayerMode === 'script') {
    return panel.originalScriptCaption ?? panel.caption;
  }
  if (panel.useAltCaptionLayer && panel.altCaption !== undefined) {
    return panel.altCaption;
  }
  return panel.caption ?? panel.originalScriptCaption;
}

/** Resolve the currently active SFX text for a panel */
export function getEffectiveSfxText(panel: StudioPanel): string | undefined {
  if (panel.textLayerMode === 'script') {
    return panel.originalScriptSfx ?? panel.sfxText;
  }
  if (panel.useAltSfxLayer && panel.altSfx !== undefined) {
    return panel.altSfx;
  }
  return panel.sfxText ?? panel.originalScriptSfx;
}

/**
 * Edit a bubble's text non-destructively:
 * - Preserves `originalScriptText` (the script version)
 * - Stores the creator's rewrite in `altText`
 * - Turns off the original script text (`useAltTextLayer = true`)
 */
export function applyAltTextEditToBubble(b: SpeechBubble, newText: string): SpeechBubble {
  const canonicalScript = b.originalScriptText !== undefined ? b.originalScriptText : (b.text ?? '');
  return {
    ...b,
    originalScriptText: canonicalScript,
    altText: newText,
    useAltTextLayer: true,
    text: newText,
  };
}

/** Toggle a single bubble between Alt Layer and Original Script Version */
export function toggleBubbleScriptLayer(b: SpeechBubble, useAlt: boolean): SpeechBubble {
  const canonicalScript = b.originalScriptText !== undefined ? b.originalScriptText : (b.text ?? '');
  const nextText = useAlt && b.altText !== undefined ? b.altText : canonicalScript;
  return {
    ...b,
    originalScriptText: canonicalScript,
    useAltTextLayer: useAlt,
    text: nextText,
  };
}

/** Toggle an entire panel between Original Script Version ('script') and Creator Alt Layer ('alt') */
export function switchPanelTextLayerMode(panel: StudioPanel, targetMode: 'alt' | 'script'): StudioPanel {
  const useAlt = targetMode === 'alt';
  const nextBubbles = (panel.bubbles || []).map(b => {
    if (b.altText === undefined && b.originalScriptText === undefined) return b;
    const orig = b.originalScriptText !== undefined ? b.originalScriptText : b.text;
    const hasAlt = b.altText !== undefined && b.altText !== orig;
    const nextUseAlt = useAlt && hasAlt;
    return {
      ...b,
      originalScriptText: orig,
      useAltTextLayer: nextUseAlt,
      text: nextUseAlt && b.altText !== undefined ? b.altText : orig,
    };
  });

  const origCap = panel.originalScriptCaption !== undefined ? panel.originalScriptCaption : panel.caption;
  const hasAltCap = panel.altCaption !== undefined && panel.altCaption !== origCap;
  const nextUseAltCap = useAlt && hasAltCap;

  const origSfx = panel.originalScriptSfx !== undefined ? panel.originalScriptSfx : panel.sfxText;
  const hasAltSfx = panel.altSfx !== undefined && panel.altSfx !== origSfx;
  const nextUseAltSfx = useAlt && hasAltSfx;

  const updated: StudioPanel = {
    ...panel,
    textLayerMode: targetMode,
    bubbles: nextBubbles,
    originalScriptCaption: origCap,
    useAltCaptionLayer: nextUseAltCap,
    caption: nextUseAltCap && panel.altCaption !== undefined ? panel.altCaption : origCap,
    originalScriptSfx: origSfx,
    useAltSfxLayer: nextUseAltSfx,
    sfxText: nextUseAltSfx && panel.altSfx !== undefined ? panel.altSfx : origSfx,
  };

  savePanelOverrideById(panel.id, {
    textLayerMode: targetMode,
    bubbles: updated.bubbles,
    caption: updated.caption,
    originalScriptCaption: updated.originalScriptCaption,
    altCaption: updated.altCaption,
    useAltCaptionLayer: updated.useAltCaptionLayer,
    sfxText: updated.sfxText,
    originalScriptSfx: updated.originalScriptSfx,
    altSfx: updated.altSfx,
    useAltSfxLayer: updated.useAltSfxLayer,
  });

  return updated;
}

// Build fresh panels from a preset layout, carrying existing art/bubbles across by index
// so re-templating a page keeps the work already placed.
function panelsFromLayout(specs: LayoutPanelSpec[], prev: StudioPanel[], isBW: boolean): StudioPanel[] {
  return specs.map((s, i) => {
    const carry = prev[i];
    return {
      id: carry?.id ?? uuidv4(),
      x: s.x, y: s.y, width: s.width, height: s.height,
      shape: s.shape ?? carry?.shape ?? 'rect',
      bgColor: carry?.bgColor ?? (isBW ? '#1a1a1a' : '#111'),
      imageUrl: carry?.imageUrl,
      bubbles: carry?.bubbles ?? [],
      caption: carry?.caption,
      originalScriptCaption: carry?.originalScriptCaption ?? carry?.caption,
      altCaption: carry?.altCaption,
      useAltCaptionLayer: carry?.useAltCaptionLayer,
      captionPos: carry?.captionPos,
      captionX: carry?.captionX,
      captionY: carry?.captionY,
      captionWidth: carry?.captionWidth,
      sfxText: carry?.sfxText,
      originalScriptSfx: carry?.originalScriptSfx ?? carry?.sfxText,
      altSfx: carry?.altSfx,
      useAltSfxLayer: carry?.useAltSfxLayer,
      sfxX: carry?.sfxX,
      sfxY: carry?.sfxY,
      textLayerMode: carry?.textLayerMode,
      borderStyle: carry?.borderStyle ?? 'solid',
      timecodeSeconds: carry?.timecodeSeconds,
      anchorTimecodeSeconds: carry?.anchorTimecodeSeconds,
      timecode: carry?.timecode,
      sourceVideoUrl: carry?.sourceVideoUrl,
      muxPlaybackId: carry?.muxPlaybackId,
      imageOffsetX: carry?.imageOffsetX ?? 0,
      imageOffsetY: carry?.imageOffsetY ?? 0,
      imageScale: carry?.imageScale ?? 1,
      isVideoLoop: carry?.isVideoLoop ?? false,
      loopInSeconds: carry?.loopInSeconds,
      loopOutSeconds: carry?.loopOutSeconds,
      cinemagraphMode: carry?.cinemagraphMode,
    };
  });
}

// ─── Bubble type configs ───────────────────────────────────────────────────────

const BUBBLE_STYLES: Record<SpeechBubble['type'], { label: string; color: string; textColor: string; borderRadius: number; fontWeight: string }> = {
  speech:    { label: 'Speech',    color: '#ffffff', textColor: '#000000', borderRadius: 16,  fontWeight: '500'  },
  thought:   { label: 'Thought',   color: '#f0f0ff', textColor: '#333366', borderRadius: 999, fontWeight: '500'  },
  shout:     { label: 'Shout!',    color: '#fff200', textColor: '#000000', borderRadius: 4,   fontWeight: '900'  },
  whisper:   { label: 'Whisper',   color: '#e8e8e8', textColor: '#555555', borderRadius: 12,  fontWeight: '300'  },
  narration: { label: 'Caption',   color: '#000033', textColor: '#ffffff', borderRadius: 0,   fontWeight: '500'  },
  sfx:       { label: 'SFX',       color: 'transparent', textColor: '#ff2200', borderRadius: 0, fontWeight: '900' },
};

// ─── Panel image loader hook ──────────────────────────────────────────────────

function useImage(url?: string): [HTMLImageElement | null] {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.onerror = () => {
      // Retry without crossOrigin if external CDN doesn't send CORS headers
      const retry = new window.Image();
      retry.onload = () => setImg(retry);
      retry.onerror = () => setImg(null);
      retry.src = url;
    };
    el.src = url;
  }, [url]);
  return [img];
}

// ─── Single panel on the canvas ───────────────────────────────────────────────

interface PanelNodeProps {
  panel: StudioPanel;
  canvasW: number;
  canvasH: number;
  selected: boolean;
  selectedBubbleId: string | null;
  isHandReframing: boolean;
  onSelect: () => void;
  onEngageHandReframe: (panelId: string, bubbleId?: string | null, openInlineTextEditor?: boolean) => void;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (id: string, updates: Partial<SpeechBubble>) => void;
  onChange: (p: StudioPanel) => void;
  onContextMenuPanel?: (panel: StudioPanel, clientX: number, clientY: number) => void;
  imagePanMode?: boolean;
  gutter: number;
  isBW: boolean;
}

function PanelNode({
  panel,
  canvasW,
  canvasH,
  selected,
  selectedBubbleId,
  isHandReframing,
  onSelect,
  onEngageHandReframe,
  onSelectBubble,
  onUpdateBubble,
  onChange,
  onContextMenuPanel,
  imagePanMode = false,
  gutter,
  isBW,
}: PanelNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const kImgRef = useRef<Konva.Image>(null);
  const [img] = useImage(panel.imageUrl);
  const [liveVideoEl, setLiveVideoEl] = useState<HTMLVideoElement | null>(null);
  const safeZoneCheckedRef = useRef<string | null>(null);
  const overrideHydratedRef = useRef<string | null>(null);

  const px = (panel.x / 100) * canvasW + gutter / 2;
  const py = (panel.y / 100) * canvasH + gutter / 2;
  const pw = (panel.width / 100) * canvasW - gutter;
  const ph = (panel.height / 100) * canvasH - gutter;

  const handActive = imagePanMode || isHandReframing;

  // Hydrate any saved override associated with panel.id so custom stills/loops/alt layers always load
  useEffect(() => {
    if (!panel.id || overrideHydratedRef.current === panel.id) return;
    overrideHydratedRef.current = panel.id;
    const saved = getPanelOverrideById(panel.id);
    if (!saved) return;
    const needsMerge =
      (saved.imageUrl && saved.imageUrl !== panel.imageUrl) ||
      (typeof saved.timecodeSeconds === 'number' && saved.timecodeSeconds !== panel.timecodeSeconds) ||
      (typeof saved.isVideoLoop === 'boolean' && saved.isVideoLoop !== panel.isVideoLoop) ||
      (typeof saved.imageOffsetX === 'number' && saved.imageOffsetX !== panel.imageOffsetX) ||
      (typeof saved.imageScale === 'number' && saved.imageScale !== panel.imageScale) ||
      (Array.isArray(saved.bubbles) && saved.bubbles.length > 0);
    if (needsMerge) {
      onChange({
        ...panel,
        imageUrl: saved.imageUrl || panel.imageUrl,
        timecodeSeconds: saved.timecodeSeconds ?? panel.timecodeSeconds,
        timecode: saved.timecode || panel.timecode,
        imageOffsetX: saved.imageOffsetX ?? panel.imageOffsetX ?? 0,
        imageOffsetY: saved.imageOffsetY ?? panel.imageOffsetY ?? 0,
        imageScale: saved.imageScale ?? panel.imageScale ?? 1,
        isVideoLoop: saved.isVideoLoop ?? panel.isVideoLoop ?? false,
        loopInSeconds: saved.loopInSeconds ?? panel.loopInSeconds,
        loopOutSeconds: saved.loopOutSeconds ?? panel.loopOutSeconds,
        cinemagraphMode: saved.cinemagraphMode ?? panel.cinemagraphMode,
        shape: (saved.shape as any) ?? panel.shape,
        borderStyle: (saved.borderStyle as any) ?? panel.borderStyle,
        textLayerMode: saved.textLayerMode ?? panel.textLayerMode,
        bubbles: Array.isArray(saved.bubbles) && saved.bubbles.length > 0 ? saved.bubbles : panel.bubbles,
        caption: saved.caption ?? panel.caption,
        originalScriptCaption: saved.originalScriptCaption ?? panel.originalScriptCaption ?? panel.caption,
        altCaption: saved.altCaption ?? panel.altCaption,
        useAltCaptionLayer: saved.useAltCaptionLayer ?? panel.useAltCaptionLayer,
        captionX: saved.captionX ?? panel.captionX,
        captionY: saved.captionY ?? panel.captionY,
        captionWidth: saved.captionWidth ?? panel.captionWidth,
        sfxText: saved.sfxText ?? panel.sfxText,
        originalScriptSfx: saved.originalScriptSfx ?? panel.originalScriptSfx ?? panel.sfxText,
        altSfx: saved.altSfx ?? panel.altSfx,
        useAltSfxLayer: saved.useAltSfxLayer ?? panel.useAltSfxLayer,
        sfxX: saved.sfxX ?? panel.sfxX,
        sfxY: saved.sfxY ?? panel.sfxY,
      });
    }
  }, [panel.id]);

  // Subscribe to Single-Load Master Video Pool when panel is a Cinemagraph / Video Loop
  useEffect(() => {
    if (!panel.isVideoLoop) {
      setLiveVideoEl(null);
      return;
    }
    const baseTc = panel.timecodeSeconds ?? 0;
    const inSec = panel.loopInSeconds ?? baseTc;
    const outSec = panel.loopOutSeconds ?? +(inSec + 4).toFixed(2);
    const unsub = sharedVideoPool.subscribePanelLoop({
      panelId: panel.id,
      videoUrl: panel.sourceVideoUrl,
      loopInSeconds: inSec,
      loopOutSeconds: outSec,
      mode: panel.cinemagraphMode || 'loop',
      onFrame: (videoEl) => {
        setLiveVideoEl(videoEl);
        groupRef.current?.getLayer()?.batchDraw();
      },
    });
    return unsub;
  }, [
    panel.id,
    panel.isVideoLoop,
    panel.loopInSeconds,
    panel.loopOutSeconds,
    panel.cinemagraphMode,
    panel.sourceVideoUrl,
    panel.timecodeSeconds,
  ]);

  useEffect(() => {
    if (selected && !isHandReframing && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
    if (selected && panel.isVideoLoop) {
      sharedVideoPool.setFocusedLoopPanel(panel.id);
    }
  }, [selected, isHandReframing, panel.id, panel.isVideoLoop]);

  // Enforce Hard Lettering Rule: Never cover character faces or obstruct key action when panel image loads
  useEffect(() => {
    if (!img || !panel.bubbles || panel.bubbles.length === 0) return;
    const checkKey = `${panel.imageUrl}_${panel.bubbles.length}`;
    if (safeZoneCheckedRef.current === checkKey) return;
    safeZoneCheckedRef.current = checkKey;

    const analysis = analyzeImageElementForFaceAndActionSafeZones(img);
    if (!analysis || analysis.faceBoxes.length === 0) return;

    let changed = false;
    const adjustedBubbles = panel.bubbles.map((b, bIdx) => {
      const bH = 22;
      const collidesWithFace = analysis.faceBoxes.some(face => {
        const ix1 = Math.max(b.x, face.x - 4);
        const iy1 = Math.max(b.y, face.y - 4);
        const ix2 = Math.min(b.x + b.width, face.x + face.width + 4);
        const iy2 = Math.min(b.y + bH, face.y + face.height + 4);
        return ix2 > ix1 && iy2 > iy1;
      });
      if (!collidesWithFace) return b;
      changed = true;
      const safe = computeSafeBalloonPlacement({
        bubbleIndex: bIdx,
        totalBubblesInPanel: panel.bubbles.length,
        textLength: (b.text || '').length,
        actionDescription: panel.aiPrompt || '',
        detectedSafeZones: analysis.recommendedZones,
        detectedFaceBoxes: analysis.faceBoxes,
        detectedActionBoxes: analysis.actionBoxes,
      });
      return {
        ...b,
        x: safe.x,
        y: safe.y,
        width: safe.width,
        tailDir: safe.tailDir,
      };
    });

    if (changed) {
      onChange({ ...panel, bubbles: adjustedBubbles });
    }
  }, [img, panel.imageUrl]);

  const borderColor =
    isHandReframing
      ? '#f59e0b'
      : panel.borderStyle === 'none'
      ? 'transparent'
      : panel.borderStyle === 'gold'
      ? '#f59e0b'
      : panel.borderStyle === 'neon'
      ? '#22d3ee'
      : isBW
      ? '#000000'
      : '#ffffff';
  const strokeWidth =
    isHandReframing
      ? 3.8
      : panel.borderStyle === 'thick'
      ? 4.5
      : panel.borderStyle === 'double' || panel.borderStyle === 'gold' || panel.borderStyle === 'neon'
      ? 3.2
      : 2;
  const slantOffset = Math.min(28, pw * 0.08);
  const borderPathData =
    panel.shape === 'diag-right'
      ? `M 0 0 L ${pw} 0 L ${pw - slantOffset} ${ph} L 0 ${ph} Z`
      : panel.shape === 'diag-left'
      ? `M ${slantOffset} 0 L ${pw} 0 L ${pw} ${ph} L 0 ${ph} Z`
      : `M 0 0 L ${pw} 0 L ${pw} ${ph} L 0 ${ph} Z`;

  // Compute cover-fit + creator pan/zoom framing inside panel
  const imgScale = Math.max(0.5, Math.min(3.5, panel.imageScale ?? 1));
  const natW = (img?.naturalWidth || 1280);
  const natH = (img?.naturalHeight || 720);
  const coverRatio = Math.max(pw / natW, ph / natH);
  const drawW = natW * coverRatio * imgScale;
  const drawH = natH * coverRatio * imgScale;
  const offX = ((panel.imageOffsetX ?? 0) / 100) * pw;
  const offY = ((panel.imageOffsetY ?? 0) / 100) * ph;
  const drawX = (pw - drawW) / 2 + offX;
  const drawY = (ph - drawH) / 2 + offY;

  const setStageCursor = (cursor: string) => {
    const container = groupRef.current?.getStage()?.container();
    if (container) container.style.cursor = cursor;
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== groupRef.current) return;
    const node = e.target;
    onChange({
      ...panel,
      x: Math.max(0, Math.min(100, (node.x() / canvasW) * 100)),
      y: Math.max(0, Math.min(100, (node.y() / canvasH) * 100)),
    });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const newW = Math.max(5, (pw * scaleX / canvasW) * 100);
    const newH = Math.max(5, (ph * scaleY / canvasH) * 100);
    onChange({
      ...panel,
      x: (node.x() / canvasW) * 100,
      y: (node.y() / canvasH) * 100,
      width: newW,
      height: newH,
    });
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    onSelect();
    if (onContextMenuPanel) {
      onContextMenuPanel(panel, e.evt.clientX, e.evt.clientY);
    }
  };

  // Mouse wheel inside panel when Hand-Style Reframe Mode is active -> smoothly scales/zooms the panel image!
  const handleWheelOnPanel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!handActive && !e.evt.altKey && !e.evt.ctrlKey) return;
    e.evt.preventDefault();
    e.cancelBubble = true;
    const delta = e.evt.deltaY < 0 ? 0.08 : -0.08;
    const nextScale = Math.max(0.5, Math.min(3.5, +((panel.imageScale ?? 1) + delta).toFixed(2)));
    savePanelOverrideById(panel.id, { imageScale: nextScale });
    onChange({ ...panel, imageScale: nextScale });
  };

  const hasAnyAltLayerOnPanel =
    (panel.bubbles || []).some(b => b.useAltTextLayer || (b.altText !== undefined && b.altText !== (b.originalScriptText ?? b.text))) ||
    panel.useAltCaptionLayer ||
    panel.useAltSfxLayer;

  const effectiveCaption = getEffectiveCaptionText(panel);
  const effectiveSfx = getEffectiveSfxText(panel);

  return (
    <>
      <Group
        ref={groupRef}
        x={px} y={py}
        draggable={!handActive}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={e => {
          e.cancelBubble = true;
          onEngageHandReframe(panel.id, null, false);
          setStageCursor('grab');
        }}
        onDblTap={e => {
          e.cancelBubble = true;
          onEngageHandReframe(panel.id, null, false);
        }}
        onWheel={handleWheelOnPanel}
        onMouseEnter={() => {
          if (panel.isVideoLoop) sharedVideoPool.setFocusedLoopPanel(panel.id);
          if (handActive) setStageCursor('grab');
        }}
        onMouseLeave={() => {
          setStageCursor('default');
        }}
        onContextMenu={handleContextMenu}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        clipFunc={ctx => {
          ctx.beginPath();
          if (panel.shape === 'diag-right') {
            ctx.moveTo(0, 0);
            ctx.lineTo(pw, 0);
            ctx.lineTo(pw - slantOffset, ph);
            ctx.lineTo(0, ph);
          } else if (panel.shape === 'diag-left') {
            ctx.moveTo(slantOffset, 0);
            ctx.lineTo(pw, 0);
            ctx.lineTo(pw, ph);
            ctx.lineTo(0, ph);
          } else if (panel.shape === 'circle-inset') {
            ctx.ellipse(pw / 2, ph / 2, pw / 2 - 2, ph / 2 - 2, 0, 0, Math.PI * 2);
          } else {
            ctx.rect(0, 0, pw, ph);
          }
          ctx.closePath();
        }}
      >
        {/* Background */}
        <Rect width={pw} height={ph} fill={panel.bgColor ?? '#111'} />

        {/* Panel image or Live Shared-Video Cinemagraph Loop with Interactive Hand-Tool Pan & Zoom Framing */}
        {(liveVideoEl || img) && (
          <KImage
            ref={kImgRef}
            image={(panel.isVideoLoop && liveVideoEl ? liveVideoEl : img) as CanvasImageSource}
            x={drawX}
            y={drawY}
            width={drawW}
            height={drawH}
            draggable={handActive || selected}
            onDblClick={e => {
              e.cancelBubble = true;
              onEngageHandReframe(panel.id, null, false);
              setStageCursor('grab');
            }}
            onMouseEnter={() => {
              if (handActive) setStageCursor('grab');
            }}
            onDragStart={e => {
              if (!handActive && !e.evt.altKey && !e.evt.shiftKey) {
                return;
              }
              e.cancelBubble = true;
              setStageCursor('grabbing');
            }}
            onDragEnd={e => {
              e.cancelBubble = true;
              setStageCursor(handActive ? 'grab' : 'default');
              const newDrawX = e.target.x();
              const newDrawY = e.target.y();
              const newOffX = Math.max(-95, Math.min(95, ((newDrawX - (pw - drawW) / 2) / pw) * 100));
              const newOffY = Math.max(-95, Math.min(95, ((newDrawY - (ph - drawH) / 2) / ph) * 100));
              const nextX = Math.round(newOffX * 10) / 10;
              const nextY = Math.round(newOffY * 10) / 10;
              savePanelOverrideById(panel.id, { imageOffsetX: nextX, imageOffsetY: nextY });
              onChange({
                ...panel,
                imageOffsetX: nextX,
                imageOffsetY: nextY,
              });
            }}
            filters={isBW ? [Konva.Filters.Grayscale] : []}
          />
        )}

        {/* Border */}
        <Path data={borderPathData} stroke={borderColor} strokeWidth={strokeWidth} fill="transparent" />

        {/* Active Hand-Tool Reframe Badge on Canvas */}
        {isHandReframing && (
          <Group x={6} y={6} listening={false}>
            <Rect
              width={Math.min(pw - 12, 232)}
              height={18}
              fill="rgba(245, 158, 11, 0.92)"
              cornerRadius={4}
            />
            <Text
              x={6}
              y={4}
              text={`✋ HAND REFRAME (${Math.round(imgScale * 100)}%) · Drag Art / Scroll Zoom / Dbl-Click Text`}
              fontSize={8}
              fontStyle="bold"
              fill="#000000"
            />
          </Group>
        )}

        {/* Alt Text Layer Status Badge on Panel */}
        {hasAnyAltLayerOnPanel && (
          <Group
            x={Math.max(6, pw - 96)}
            y={ph - 22}
            onClick={e => {
              e.cancelBubble = true;
              const nextMode = panel.textLayerMode === 'script' ? 'alt' : 'script';
              onChange(switchPanelTextLayerMode(panel, nextMode));
            }}
          >
            <Rect
              width={90}
              height={16}
              fill={panel.textLayerMode === 'script' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(16, 185, 129, 0.92)'}
              cornerRadius={4}
              stroke={panel.textLayerMode === 'script' ? '#94a3b8' : '#34d399'}
              strokeWidth={0.8}
            />
            <Text
              x={5}
              y={3.5}
              text={panel.textLayerMode === 'script' ? '📜 SCRIPT LAYER' : '✨ ALT LAYER ON'}
              fontSize={8}
              fontStyle="bold"
              fill={panel.textLayerMode === 'script' ? '#e2e8f0' : '#022c22'}
            />
          </Group>
        )}

        {/* Panel Timecode & Cinemagraph Loop Badges */}
        {(typeof panel.timecodeSeconds === 'number' || panel.timecode || panel.isVideoLoop) && (
          <Group x={6} y={ph - 22} listening={false}>
            <Rect
              width={panel.isVideoLoop ? 138 : 66}
              height={16}
              fill="rgba(0,0,0,0.78)"
              cornerRadius={4}
              stroke={panel.isVideoLoop ? '#a855f7' : '#fb923c'}
              strokeWidth={0.8}
            />
            <Text
              x={5}
              y={3.5}
              text={
                panel.isVideoLoop
                  ? `🔁 LOOP ${((panel.loopOutSeconds ?? (panel.timecodeSeconds ?? 0) + 4) - (panel.loopInSeconds ?? panel.timecodeSeconds ?? 0)).toFixed(1)}s · ⏱ ${panel.timecode || formatPanelTimecode(panel.timecodeSeconds)}`
                  : `⏱ ${panel.timecode || formatPanelTimecode(panel.timecodeSeconds)}`
              }
              fontSize={8.5}
              fontStyle="bold"
              fill={panel.isVideoLoop ? '#e9d5ff' : '#fed7aa'}
            />
          </Group>
        )}

        {/* Speech bubbles with interactive free arrangement, scaling & non-destructive Alt Text Layer */}
        {panel.bubbles.map(b => {
          const style = BUBBLE_STYLES[b.type] || BUBBLE_STYLES.speech;
          const bubbleScale = Math.max(0.6, Math.min(2.2, b.scale ?? 1));
          const bx = (b.x / 100) * pw;
          const by = (b.y / 100) * ph;
          const bw = ((b.width / 100) * pw) * bubbleScale;
          const isNarr = b.type === 'narration';
          const isSfx  = b.type === 'sfx';
          const isSelected = selectedBubbleId === b.id;

          const displayText = getEffectiveBubbleText(b, panel.textLayerMode);
          const isBubbleUsingAlt =
            panel.textLayerMode !== 'script' &&
            Boolean(b.useAltTextLayer && b.altText !== undefined);

          // Multi-line height wrapping estimation
          const textLen = (displayText || '').length;
          const effectiveFontSize = (isSfx ? 22 : b.fontSize ?? 11) * bubbleScale;
          const charsPerLine = Math.max(10, Math.floor(bw / (effectiveFontSize * 0.65)));
          const lineCount = Math.max(1, Math.ceil(textLen / charsPerLine));
          const bubbleH = isSfx ? 36 * bubbleScale : Math.max(28 * bubbleScale, lineCount * (effectiveFontSize + 5) + 10);

          // Vector speech bubble tail path
          let tailPath = '';
          if (b.tailDir === 'br') {
            tailPath = `M ${Math.max(10, bw - 26)} ${bubbleH - 1} L ${Math.max(10, bw - 8)} ${bubbleH + 14} L ${Math.max(10, bw - 12)} ${bubbleH - 1} Z`;
          } else if (b.tailDir === 'bl') {
            tailPath = `M 12 ${bubbleH - 1} L 8 ${bubbleH + 14} L 26 ${bubbleH - 1} Z`;
          } else if (b.tailDir === 'tr') {
            tailPath = `M ${Math.max(10, bw - 26)} 1 L ${Math.max(10, bw - 8)} -14 L ${Math.max(10, bw - 12)} 1 Z`;
          } else if (b.tailDir === 'tl') {
            tailPath = `M 12 1 L 8 -14 L 26 1 Z`;
          }

          return (
            <Group
              key={b.id}
              x={bx}
              y={by}
              draggable
              onMouseEnter={() => setStageCursor('move')}
              onMouseLeave={() => setStageCursor(handActive ? 'grab' : 'default')}
              onClick={e => {
                e.cancelBubble = true;
                onSelect();
                onSelectBubble(b.id);
              }}
              onTap={e => {
                e.cancelBubble = true;
                onSelect();
                onSelectBubble(b.id);
              }}
              onDblClick={e => {
                e.cancelBubble = true;
                // Double-clicking a bubble engages Hand Reframe mode AND opens the inline Alt-Layer text editor!
                onEngageHandReframe(panel.id, b.id, true);
              }}
              onDblTap={e => {
                e.cancelBubble = true;
                onEngageHandReframe(panel.id, b.id, true);
              }}
              onWheel={e => {
                // Mouse wheel over a selected bubble (or in Hand Reframe mode with Shift) scales the bubble!
                if (!isSelected && !e.evt.shiftKey) return;
                e.evt.preventDefault();
                e.cancelBubble = true;
                const dW = e.evt.deltaY < 0 ? 3 : -3;
                const nextW = Math.max(18, Math.min(92, Math.round((b.width || 38) + dW)));
                onUpdateBubble(b.id, { width: nextW });
              }}
              onDragStart={e => {
                e.cancelBubble = true;
                setStageCursor('grabbing');
              }}
              onDragEnd={e => {
                e.cancelBubble = true;
                setStageCursor(handActive ? 'grab' : 'default');
                const newX = Math.max(0, Math.min(100 - (bw / pw) * 100, (e.target.x() / pw) * 100));
                const newY = Math.max(0, Math.min(100 - (bubbleH / ph) * 100, (e.target.y() / ph) * 100));
                onUpdateBubble(b.id, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
              }}
            >
              {/* Speaker Character badge + ALT layer tag */}
              {(b.character || isBubbleUsingAlt) && !isSfx && !isNarr && (
                <Text
                  text={`${(b.character || '').toUpperCase()}${isBubbleUsingAlt ? ' [ALT]' : ''}`.trim()}
                  y={-12}
                  fontSize={8.5}
                  fontStyle="bold"
                  fill={isBubbleUsingAlt ? '#34d399' : isBW ? '#ffffff' : '#ff8c00'}
                  shadowColor="#000000"
                  shadowBlur={4}
                  shadowOpacity={0.8}
                />
              )}

              {/* Bubble body */}
              {!isSfx && (
                <Rect
                  width={bw}
                  height={bubbleH}
                  fill={isNarr ? '#000033ee' : style.color}
                  cornerRadius={style.borderRadius}
                  stroke={
                    isSelected
                      ? '#ff8c00'
                      : isBubbleUsingAlt
                      ? '#10b981'
                      : isHandReframing
                      ? '#f59e0b'
                      : isNarr
                      ? '#3b82f6'
                      : '#33333360'
                  }
                  strokeWidth={isSelected || isHandReframing ? 2 : 1}
                  shadowColor={isSelected ? '#ff8c00' : '#000000'}
                  shadowBlur={isSelected ? 8 : 4}
                  shadowOpacity={0.4}
                />
              )}

              {/* Vector tail */}
              {tailPath && !isSfx && !isNarr && (
                <Path
                  data={tailPath}
                  fill={style.color}
                  stroke={isSelected ? '#ff8c00' : '#33333360'}
                  strokeWidth={1}
                />
              )}

              {/* Dialogue text (renders active Alt Layer or Original Script Version) */}
              <Text
                text={displayText || (b.type === 'sfx' ? 'POW!' : 'Text…')}
                width={bw}
                padding={6}
                fontSize={effectiveFontSize}
                fontStyle={isSfx ? 'bold' : style.fontWeight}
                fill={style.textColor}
                align="center"
                verticalAlign="middle"
                height={bubbleH}
                wrap="word"
              />

              {/* Interactive Width/Scale Handle on Selected or Hand-Reframing Bubble */}
              {(isSelected || isHandReframing) && !isSfx && (
                <Rect
                  x={bw - 7}
                  y={bubbleH / 2 - 7}
                  width={10}
                  height={14}
                  fill="#f59e0b"
                  cornerRadius={3}
                  stroke="#000000"
                  strokeWidth={1}
                  draggable
                  onMouseEnter={() => setStageCursor('ew-resize')}
                  onDragStart={e => {
                    e.cancelBubble = true;
                  }}
                  onDragEnd={e => {
                    e.cancelBubble = true;
                    const newPixelW = Math.max(55, Math.min(pw - bx, e.target.x() + 7));
                    const nextWidthPct = Math.max(18, Math.min(92, Math.round((newPixelW / pw) * 100)));
                    e.target.x(bw - 7);
                    e.target.y(bubbleH / 2 - 7);
                    onUpdateBubble(b.id, { width: nextWidthPct });
                  }}
                />
              )}
            </Group>
          );
        })}

        {/* Narrative Caption (Freely Draggable & Editable onto Alt Layer) */}
        {effectiveCaption && (
          <Group
            x={panel.captionX !== undefined ? (panel.captionX / 100) * pw : 0}
            y={
              panel.captionY !== undefined
                ? (panel.captionY / 100) * ph
                : panel.captionPos === 'top'
                ? 0
                : ph - 28
            }
            draggable
            onMouseEnter={() => setStageCursor('move')}
            onMouseLeave={() => setStageCursor(handActive ? 'grab' : 'default')}
            onClick={e => {
              e.cancelBubble = true;
              onSelect();
            }}
            onDblClick={e => {
              e.cancelBubble = true;
              onEngageHandReframe(panel.id, '__CAPTION__', true);
            }}
            onDragStart={e => {
              e.cancelBubble = true;
              setStageCursor('grabbing');
            }}
            onDragEnd={e => {
              e.cancelBubble = true;
              setStageCursor(handActive ? 'grab' : 'default');
              const capW = panel.captionWidth ? (panel.captionWidth / 100) * pw : pw;
              const nextCapX = Math.max(0, Math.min(100 - (capW / pw) * 100, (e.target.x() / pw) * 100));
              const nextCapY = Math.max(0, Math.min(100 - (28 / ph) * 100, (e.target.y() / ph) * 100));
              const rx = Math.round(nextCapX * 10) / 10;
              const ry = Math.round(nextCapY * 10) / 10;
              savePanelOverrideById(panel.id, { captionX: rx, captionY: ry });
              onChange({ ...panel, captionX: rx, captionY: ry });
            }}
          >
            <Rect
              width={panel.captionWidth ? (panel.captionWidth / 100) * pw : pw}
              height={28}
              fill="#000000ee"
              stroke={panel.useAltCaptionLayer && panel.textLayerMode !== 'script' ? '#10b981' : '#ffffff25'}
              strokeWidth={panel.useAltCaptionLayer && panel.textLayerMode !== 'script' ? 1.5 : 1}
            />
            <Text
              text={effectiveCaption}
              width={panel.captionWidth ? (panel.captionWidth / 100) * pw : pw}
              height={28}
              fontSize={9.5}
              fill={panel.useAltCaptionLayer && panel.textLayerMode !== 'script' ? '#6ee7b7' : '#f59e0b'}
              fontFamily="Courier New, monospace"
              fontStyle="bold"
              align="left"
              padding={6}
              verticalAlign="middle"
            />
          </Group>
        )}

        {/* Kinetic SFX text (Freely Draggable & Editable onto Alt Layer) */}
        {effectiveSfx && (
          <Text
            text={effectiveSfx}
            x={panel.sfxX !== undefined ? (panel.sfxX / 100) * pw : pw * 0.25}
            y={panel.sfxY !== undefined ? (panel.sfxY / 100) * ph : ph * 0.35}
            fontSize={panel.sfxStyle === 'manga' ? 44 : 34}
            fontStyle="bold"
            fill={isBW ? '#ffffff' : '#ff2200'}
            stroke="#000000"
            strokeWidth={4}
            rotation={-12}
            draggable
            onMouseEnter={() => setStageCursor('move')}
            onMouseLeave={() => setStageCursor(handActive ? 'grab' : 'default')}
            onClick={e => {
              e.cancelBubble = true;
              onSelect();
            }}
            onDblClick={e => {
              e.cancelBubble = true;
              onEngageHandReframe(panel.id, '__SFX__', true);
            }}
            onDragStart={e => {
              e.cancelBubble = true;
              setStageCursor('grabbing');
            }}
            onDragEnd={e => {
              e.cancelBubble = true;
              setStageCursor(handActive ? 'grab' : 'default');
              const nextSfxX = Math.max(0, Math.min(90, (e.target.x() / pw) * 100));
              const nextSfxY = Math.max(0, Math.min(90, (e.target.y() / ph) * 100));
              const rx = Math.round(nextSfxX * 10) / 10;
              const ry = Math.round(nextSfxY * 10) / 10;
              savePanelOverrideById(panel.id, { sfxX: rx, sfxY: ry });
              onChange({ ...panel, sfxX: rx, sfxY: ry });
            }}
          />
        )}
      </Group>

      {selected && !isHandReframing && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 40 || newBox.height < 40) return oldBox;
            return newBox;
          }}
          enabledAnchors={['top-left','top-right','bottom-left','bottom-right','middle-right','middle-left','top-center','bottom-center']}
          borderStroke="#ff8c00"
          anchorFill="#ff8c00"
          anchorStroke="#ff8c00"
          rotateEnabled={false}
        />
      )}
    </>
  );
}


// ─── Bubble editor sidebar ────────────────────────────────────────────────────

function BubbleSidebar({
  panel,
  selectedBubbleId,
  isHandReframing,
  onToggleHandReframe,
  onSelectBubble,
  onChange,
  onDraw,
}: {
  panel: StudioPanel;
  selectedBubbleId: string | null;
  isHandReframing: boolean;
  onToggleHandReframe: () => void;
  onSelectBubble: (id: string | null) => void;
  onChange: (p: StudioPanel) => void;
  onDraw: () => void;
}) {
  const selectedBubble = panel.bubbles.find(b => b.id === selectedBubbleId) || null;
  const anchorSec = panel.anchorTimecodeSeconds ?? panel.timecodeSeconds ?? 120;
  const currentSec = panel.timecodeSeconds ?? anchorSec;
  const [scrubSec, setScrubSec] = useState<number>(currentSec);
  const [scrubSaving, setScrubSaving] = useState<boolean>(false);

  useEffect(() => {
    setScrubSec(panel.timecodeSeconds ?? panel.anchorTimecodeSeconds ?? 120);
  }, [panel.id, panel.timecodeSeconds, panel.anchorTimecodeSeconds]);

  const scrubBounds = getPanelScrubBounds(anchorSec);

  const handleCommitNewStill = async (targetSec = scrubSec) => {
    setScrubSaving(true);
    try {
      const res = await createStillForPanelAtTimecode({
        panelId: panel.id,
        targetSeconds: targetSec,
        muxPlaybackId: panel.muxPlaybackId,
        sourceVideoUrl: panel.sourceVideoUrl,
        existingImageUrl: panel.imageUrl,
      });
      onChange({
        ...panel,
        imageUrl: res.imageUrl,
        timecodeSeconds: res.timecodeSeconds,
        timecode: res.timecode,
      });
    } finally {
      setScrubSaving(false);
    }
  };

  const addBubble = (type: SpeechBubble['type']) => {
    const defaultText = type === 'sfx' ? 'POW!' : 'Dialogue text…';
    const safe = computeSafeBalloonPlacement({
      bubbleIndex: panel.bubbles.length,
      totalBubblesInPanel: panel.bubbles.length + 1,
      textLength: defaultText.length,
      actionDescription: panel.aiPrompt || '',
    });
    const bubble: SpeechBubble = {
      id: uuidv4(),
      type,
      text: defaultText,
      originalScriptText: defaultText,
      useAltTextLayer: false,
      x: safe.x,
      y: safe.y,
      width: safe.width,
      scale: 1,
      tailDir: safe.tailDir,
      fontSize: 10.5,
    };
    const nextBubbles = [...panel.bubbles, bubble];
    savePanelOverrideById(panel.id, { bubbles: nextBubbles });
    onChange({ ...panel, bubbles: nextBubbles });
    onSelectBubble(bubble.id);
  };

  const updateBubble = (id: string, updates: Partial<SpeechBubble>) => {
    const nextBubbles = panel.bubbles.map(b => (b.id === id ? { ...b, ...updates } : b));
    savePanelOverrideById(panel.id, { bubbles: nextBubbles });
    onChange({ ...panel, bubbles: nextBubbles });
  };

  // Editing dialogue text automatically creates/updates the Alt Layer and turns off Original Script text
  const handleRewriteBubbleTextOnAltLayer = (bubble: SpeechBubble, newText: string) => {
    const updatedBubble = applyAltTextEditToBubble(bubble, newText);
    const nextBubbles = panel.bubbles.map(b => (b.id === bubble.id ? updatedBubble : b));
    savePanelOverrideById(panel.id, { bubbles: nextBubbles, textLayerMode: 'alt' });
    onChange({
      ...panel,
      textLayerMode: 'alt',
      bubbles: nextBubbles,
    });
  };

  const handleToggleBubbleScriptVersion = (bubble: SpeechBubble, useAlt: boolean) => {
    const toggled = toggleBubbleScriptLayer(bubble, useAlt);
    const nextBubbles = panel.bubbles.map(b => (b.id === bubble.id ? toggled : b));
    const anyStillAlt = nextBubbles.some(b => b.useAltTextLayer) || panel.useAltCaptionLayer || panel.useAltSfxLayer;
    const nextMode: 'alt' | 'script' = useAlt ? 'alt' : anyStillAlt ? 'alt' : 'script';
    savePanelOverrideById(panel.id, { bubbles: nextBubbles, textLayerMode: nextMode });
    onChange({
      ...panel,
      textLayerMode: nextMode,
      bubbles: nextBubbles,
    });
  };

  const deleteBubble = (id: string) => {
    const nextBubbles = panel.bubbles.filter(b => b.id !== id);
    savePanelOverrideById(panel.id, { bubbles: nextBubbles });
    onChange({ ...panel, bubbles: nextBubbles });
    if (selectedBubbleId === id) onSelectBubble(null);
  };

  const hasAnyAltLayer =
    (panel.bubbles || []).some(
      b => b.useAltTextLayer || (b.altText !== undefined && b.altText !== (b.originalScriptText ?? b.text))
    ) ||
    Boolean(panel.useAltCaptionLayer || panel.altCaption !== undefined) ||
    Boolean(panel.useAltSfxLayer || panel.altSfx !== undefined);

  const isPanelOnScriptMode = panel.textLayerMode === 'script';

  return (
    <div className="space-y-4">
      {/* Hand-Style Reframe Mode Status & Quick Toggle */}
      <div
        className={`rounded-xl p-2.5 border transition-colors ${
          isHandReframing
            ? 'bg-amber-500/15 border-amber-500/40'
            : 'bg-white/[0.03] border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Hand size={13} className={isHandReframing ? 'text-amber-400 shrink-0' : 'text-white/40 shrink-0'} />
            <span className="text-[9.5px] font-black uppercase tracking-wider text-white/85 truncate">
              {isHandReframing ? 'Hand Reframe Active' : 'Hand Reframe Tool'}
            </span>
          </div>
          <button
            onClick={onToggleHandReframe}
            className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-colors ${
              isHandReframing
                ? 'bg-amber-500 text-black'
                : 'bg-white/10 text-white/60 hover:text-white'
            }`}
          >
            {isHandReframing ? 'ON (Dbl-Click)' : 'Engage'}
          </button>
        </div>
        <p className="text-[8.5px] text-white/45 leading-snug mt-1">
          Double-click inside any panel to auto-engage the Hand tool: drag art to pan, scroll wheel to scale image, drag bubbles freely, or double-click text to rewrite on the Alt Layer.
        </p>
      </div>

      {/* Panel-Wide Script Version vs. Alt Layer Switcher */}
      <div className="rounded-xl p-2.5 bg-emerald-500/10 border border-emerald-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
            <Layers size={11} /> Text Layer Mode
          </span>
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-emerald-200 border border-emerald-500/20">
            {isPanelOnScriptMode || !hasAnyAltLayer ? '📜 Script Version' : '✨ Alt Layer Active'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => onChange(switchPanelTextLayerMode(panel, 'script'))}
            className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border transition-colors ${
              isPanelOnScriptMode || !hasAnyAltLayer
                ? 'bg-slate-700 border-slate-400 text-white shadow-sm'
                : 'bg-black/30 border-white/10 text-white/50 hover:text-white'
            }`}
            title="Turn off Alt Layer edits and return to the original script version"
          >
            📜 Original Script
          </button>
          <button
            onClick={() => onChange(switchPanelTextLayerMode(panel, 'alt'))}
            className={`py-1.5 px-2 rounded-lg text-[9px] font-black uppercase border transition-colors ${
              !isPanelOnScriptMode && hasAnyAltLayer
                ? 'bg-emerald-500 border-emerald-400 text-black shadow-sm'
                : 'bg-black/30 border-white/10 text-white/50 hover:text-white'
            }`}
            title="Show creator Alt Layer text rewrites (original script text is turned off, never deleted)"
          >
            ✨ Alt Layer
          </button>
        </div>
      </div>

      {/* If a bubble is selected, show focused editor with non-destructive Alt Layer */}
      {selectedBubble ? (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Selected {selectedBubble.type}
              </span>
              {selectedBubble.useAltTextLayer && panel.textLayerMode !== 'script' && (
                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                  ALT LAYER
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteBubble(selectedBubble.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete bubble"
              >
                <Trash2 size={12} />
              </button>
              <button
                onClick={() => onSelectBubble(null)}
                className="text-white/40 hover:text-white p-1"
                title="Deselect"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Speaker character tag */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Speaker Character</label>
            <input
              type="text"
              value={selectedBubble.character ?? ''}
              onChange={e => updateBubble(selectedBubble.id, { character: e.target.value })}
              placeholder="e.g. Melvin Lester, Katrina"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-400/50"
            />
          </div>

          {/* Dialogue text (Editing creates Alt Layer & turns off Original Script text) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[8px] uppercase tracking-widest text-white/50">
                Dialogue Text (Edits → Alt Layer)
              </label>
              {(selectedBubble.originalScriptText !== undefined &&
                (selectedBubble.altText !== undefined || selectedBubble.useAltTextLayer)) && (
                <button
                  onClick={() =>
                    handleToggleBubbleScriptVersion(
                      selectedBubble,
                      !(selectedBubble.useAltTextLayer && panel.textLayerMode !== 'script')
                    )
                  }
                  className="text-[8px] font-bold text-emerald-300 hover:underline flex items-center gap-1"
                >
                  <RotateCcw size={9} />
                  {selectedBubble.useAltTextLayer && panel.textLayerMode !== 'script'
                    ? 'Return to Script Version'
                    : 'Re-enable Alt Rewrite'}
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={getEffectiveBubbleText(selectedBubble, panel.textLayerMode)}
              onChange={e => handleRewriteBubbleTextOnAltLayer(selectedBubble, e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400/60 resize-none font-sans"
              placeholder="Rewrite dialogue on Alt Layer..."
            />
            {selectedBubble.originalScriptText &&
              selectedBubble.originalScriptText !== getEffectiveBubbleText(selectedBubble, panel.textLayerMode) && (
                <div className="p-2 rounded-lg bg-black/50 border border-white/10 text-[9.5px] text-white/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-[8px] text-white/40">
                      📜 Original Script (Turned Off):
                    </span>
                    <button
                      onClick={() => handleToggleBubbleScriptVersion(selectedBubble, false)}
                      className="text-[8px] font-black uppercase text-orange-300 hover:text-orange-200"
                    >
                      Restore Script
                    </button>
                  </div>
                  <p className="italic text-white/60 leading-snug">
                    &ldquo;{selectedBubble.originalScriptText}&rdquo;
                  </p>
                </div>
              )}
          </div>

          {/* Bubble style pills */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Bubble Style</label>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(BUBBLE_STYLES) as SpeechBubble['type'][]).map(type => (
                <button
                  key={type}
                  onClick={() => updateBubble(selectedBubble.id, { type })}
                  className={`py-1 text-[9px] rounded-lg border transition-colors ${
                    selectedBubble.type === type
                      ? 'bg-orange-500 border-orange-400 text-black font-bold'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {BUBBLE_STYLES[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* Tail direction */}
          <div>
            <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Tail Direction</label>
            <div className="grid grid-cols-4 gap-1">
              {(['tl', 'tr', 'bl', 'br'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => updateBubble(selectedBubble.id, { tailDir: dir })}
                  className={`py-1 text-[9px] uppercase font-bold rounded border transition-colors ${
                    selectedBubble.tailDir === dir
                      ? 'bg-orange-500/20 border-orange-400 text-orange-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Width, Scale & Font Size */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Width %</label>
              <input
                type="number"
                min={18}
                max={95}
                value={selectedBubble.width}
                onChange={e => updateBubble(selectedBubble.id, { width: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Scale %</label>
              <input
                type="number"
                min={60}
                max={200}
                step={5}
                value={Math.round((selectedBubble.scale ?? 1) * 100)}
                onChange={e => updateBubble(selectedBubble.id, { scale: Number(e.target.value) / 100 })}
                className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[8px] uppercase tracking-widest text-white/40 block mb-1">Font</label>
              <input
                type="number"
                min={8}
                max={32}
                value={selectedBubble.fontSize ?? 11}
                onChange={e => updateBubble(selectedBubble.id, { fontSize: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-xs text-white"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Add new bubble elements */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-2">Add speech element</p>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(BUBBLE_STYLES) as SpeechBubble['type'][]).map(type => (
            <button
              key={type}
              onClick={() => addBubble(type)}
              className="py-1.5 text-[10px] rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors text-center"
            >
              + {BUBBLE_STYLES[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* All bubbles on panel */}
      {panel.bubbles.length > 0 && !selectedBubble && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Bubbles on this panel</p>
          {panel.bubbles.map(b => {
            const activeText = getEffectiveBubbleText(b, panel.textLayerMode);
            const isAlt = b.useAltTextLayer && panel.textLayerMode !== 'script';
            return (
              <div
                key={b.id}
                onClick={() => onSelectBubble(b.id)}
                className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-orange-500/50 cursor-pointer transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black uppercase text-orange-400">{b.character || b.type}</span>
                    {isAlt && (
                      <span className="text-[7.5px] font-black uppercase px-1 rounded bg-emerald-500/20 text-emerald-300">
                        ALT
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/70 truncate">{activeText || 'Empty'}</p>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    deleteBubble(b.id);
                  }}
                  className="text-white/20 hover:text-red-400 p-1"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Caption bar (Editing creates Alt Caption Layer & preserves Original Script Caption) */}
      <div className="pt-2 border-t border-white/5 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Narrative Caption</p>
          {(panel.originalScriptCaption !== undefined &&
            (panel.altCaption !== undefined || panel.useAltCaptionLayer)) && (
            <button
              onClick={() => {
                const nextUseAlt = !(panel.useAltCaptionLayer && panel.textLayerMode !== 'script');
                const origCap = panel.originalScriptCaption ?? panel.caption;
                const nextCap = nextUseAlt && panel.altCaption !== undefined ? panel.altCaption : origCap;
                savePanelOverrideById(panel.id, {
                  useAltCaptionLayer: nextUseAlt,
                  caption: nextCap,
                  textLayerMode: nextUseAlt ? 'alt' : panel.textLayerMode,
                });
                onChange({
                  ...panel,
                  useAltCaptionLayer: nextUseAlt,
                  caption: nextCap,
                  textLayerMode: nextUseAlt ? 'alt' : panel.textLayerMode,
                });
              }}
              className="text-[8px] font-bold text-emerald-300 hover:underline flex items-center gap-1"
            >
              <RotateCcw size={9} />
              {panel.useAltCaptionLayer && panel.textLayerMode !== 'script'
                ? 'Script Caption'
                : 'Alt Caption'}
            </button>
          )}
        </div>
        <textarea
          rows={2}
          value={getEffectiveCaptionText(panel) ?? ''}
          onChange={e => {
            const val = e.target.value;
            const origCap =
              panel.originalScriptCaption !== undefined ? panel.originalScriptCaption : (panel.caption ?? '');
            savePanelOverrideById(panel.id, {
              originalScriptCaption: origCap,
              altCaption: val,
              useAltCaptionLayer: true,
              caption: val,
              textLayerMode: 'alt',
            });
            onChange({
              ...panel,
              originalScriptCaption: origCap,
              altCaption: val,
              useAltCaptionLayer: true,
              caption: val,
              textLayerMode: 'alt',
            });
          }}
          placeholder="Monologue / Time-Location caption (edits onto Alt Layer)…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none mb-1.5 resize-none font-mono"
        />
        <div className="flex gap-1">
          {(['top', 'bottom'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => onChange({ ...panel, captionPos: pos, captionX: undefined, captionY: undefined })}
              className={`flex-1 py-1 rounded text-[9px] border transition-colors capitalize ${
                panel.captionPos === pos ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold' : 'border-white/10 text-white/40 hover:text-white'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* SFX text */}
      <div className="pt-2 border-t border-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Panel SFX Text</p>
        <input
          type="text"
          value={getEffectiveSfxText(panel) ?? ''}
          onChange={e => {
            const val = e.target.value;
            const origSfx = panel.originalScriptSfx !== undefined ? panel.originalScriptSfx : (panel.sfxText ?? '');
            savePanelOverrideById(panel.id, {
              originalScriptSfx: origSfx,
              altSfx: val,
              useAltSfxLayer: true,
              sfxText: val,
              textLayerMode: 'alt',
            });
            onChange({
              ...panel,
              originalScriptSfx: origSfx,
              altSfx: val,
              useAltSfxLayer: true,
              sfxText: val,
              textLayerMode: 'alt',
            });
          }}
          placeholder="BOOM! SHHH! (optional)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none mb-1.5 font-bold"
        />
        <div className="flex gap-1">
          {(['bold', 'impact', 'manga'] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...panel, sfxStyle: s })}
              className={`flex-1 py-0.5 rounded text-[9px] border transition-colors ${
                panel.sfxStyle === s ? 'bg-orange-500/20 border-orange-500 text-orange-400 font-bold' : 'border-white/10 text-white/30 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Panel image, ±60s Frame Scrubber, Pan/Zoom Framing, and Cinemagraph Loop */}
      <div className="pt-2 border-t border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Panel Artwork & Frame</p>
          <span className="text-[8px] font-mono text-orange-400/80 truncate max-w-[110px]" title={panel.id}>
            ID: {panel.id.slice(0, 12)}
          </span>
        </div>
        {panel.imageUrl && (
          <div className="rounded-lg overflow-hidden border border-white/10 aspect-video bg-black relative">
            <img src={panel.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] font-mono text-orange-300 border border-orange-500/30">
              ⏱ {panel.timecode || formatPanelTimecode(panel.timecodeSeconds ?? scrubSec)}
            </div>
            <button
              onClick={() => onChange({ ...panel, imageUrl: undefined })}
              className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 p-1 rounded text-white"
              title="Remove art"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}

        {/* ±1 Minute (±60s) Timeline Frame Scrubber */}
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-orange-300">
              ⏱ Scrub Frame (±1 Min)
            </span>
            <span className="text-[10px] font-mono font-bold text-white">
              {formatPanelTimecode(scrubSec)}
            </span>
          </div>
          <input
            type="range"
            min={scrubBounds.minSeconds}
            max={scrubBounds.maxSeconds}
            step={0.1}
            value={scrubSec}
            onChange={e => setScrubSec(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-[8px] font-mono text-white/35">
            <span>-1m ({formatPanelTimecode(scrubBounds.minSeconds)})</span>
            <span>Anchor ({formatPanelTimecode(scrubBounds.anchorSeconds)})</span>
            <span>+1m ({formatPanelTimecode(scrubBounds.maxSeconds)})</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {[-10, -1, -0.2, +0.2, +1, +10].map(delta => (
              <button
                key={delta}
                onClick={() =>
                  setScrubSec(s =>
                    Math.max(scrubBounds.minSeconds, Math.min(scrubBounds.maxSeconds, +(s + delta).toFixed(1)))
                  )
                }
                className="py-1 rounded bg-white/5 hover:bg-white/10 text-[8px] font-mono text-white/70 border border-white/10"
              >
                {delta > 0 ? `+${delta}s` : `${delta}s`}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleCommitNewStill(scrubSec)}
            disabled={scrubSaving}
            className="w-full py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {scrubSaving ? 'Saving Still for Panel…' : '📸 Set New Frame for Panel'}
          </button>
        </div>

        {/* Interactive Image Pan & Zoom Framing inside Panel */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">
              ✋ Move & Frame Art in Panel
            </span>
            <button
              onClick={() => {
                savePanelOverrideById(panel.id, { imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
                onChange({ ...panel, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
              }}
              className="text-[8px] text-orange-400 hover:underline"
            >
              Reset Fit
            </button>
          </div>
          <label className="block">
            <div className="flex justify-between text-[8px] text-white/40">
              <span>Zoom / Scale</span>
              <span>{Math.round((panel.imageScale ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.5}
              step={0.05}
              value={panel.imageScale ?? 1}
              onChange={e => {
                const v = Number(e.target.value);
                savePanelOverrideById(panel.id, { imageScale: v });
                onChange({ ...panel, imageScale: v });
              }}
              className="w-full accent-orange-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="flex justify-between text-[8px] text-white/40">
                <span>Pan X</span>
                <span>{Math.round(panel.imageOffsetX ?? 0)}%</span>
              </div>
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={panel.imageOffsetX ?? 0}
                onChange={e => {
                  const v = Number(e.target.value);
                  savePanelOverrideById(panel.id, { imageOffsetX: v });
                  onChange({ ...panel, imageOffsetX: v });
                }}
                className="w-full accent-orange-500"
              />
            </label>
            <label className="block">
              <div className="flex justify-between text-[8px] text-white/40">
                <span>Pan Y</span>
                <span>{Math.round(panel.imageOffsetY ?? 0)}%</span>
              </div>
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={panel.imageOffsetY ?? 0}
                onChange={e => {
                  const v = Number(e.target.value);
                  savePanelOverrideById(panel.id, { imageOffsetY: v });
                  onChange({ ...panel, imageOffsetY: v });
                }}
                className="w-full accent-orange-500"
              />
            </label>
          </div>
        </div>

        {/* Cinemagraph / Live Video Loop (Up to 15s, Single Shared Master Video) */}
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-purple-300">
              🔁 Cinemagraph / Video Loop
            </span>
            <button
              onClick={() => {
                const nextLoop = !panel.isVideoLoop;
                const baseIn = panel.loopInSeconds ?? panel.timecodeSeconds ?? scrubSec;
                const clamped = clampLoopInOutPoints(baseIn, panel.loopOutSeconds ?? baseIn + 4);
                savePanelOverrideById(panel.id, {
                  isVideoLoop: nextLoop,
                  loopInSeconds: clamped.loopInSeconds,
                  loopOutSeconds: clamped.loopOutSeconds,
                });
                onChange({
                  ...panel,
                  isVideoLoop: nextLoop,
                  loopInSeconds: clamped.loopInSeconds,
                  loopOutSeconds: clamped.loopOutSeconds,
                });
              }}
              className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-colors ${
                panel.isVideoLoop ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/50 hover:text-white'
              }`}
            >
              {panel.isVideoLoop ? 'LIVE LOOP ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[8px] text-purple-200/60 leading-snug">
            Reads In/Out points (max {MAX_CINEMAGRAPH_LOOP_SECONDS}s) from the single shared master video player—never duplicates video loads.
          </p>
          {panel.isVideoLoop && (
            <div className="space-y-1.5 pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="text-[8px] text-purple-200/70">In Point (s)</span>
                  <input
                    type="number"
                    step={0.2}
                    value={panel.loopInSeconds ?? scrubSec}
                    onChange={e => {
                      const inVal = Number(e.target.value);
                      const clamped = clampLoopInOutPoints(inVal, panel.loopOutSeconds ?? inVal + 4);
                      savePanelOverrideById(panel.id, clamped);
                      onChange({ ...panel, ...clamped });
                    }}
                    className="w-full bg-black/40 border border-purple-500/30 rounded px-1.5 py-0.5 text-[10px] text-white font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-[8px] text-purple-200/70">Out Point (max +15s)</span>
                  <input
                    type="number"
                    step={0.2}
                    value={panel.loopOutSeconds ?? +(scrubSec + 4).toFixed(1)}
                    onChange={e => {
                      const outVal = Number(e.target.value);
                      const clamped = clampLoopInOutPoints(panel.loopInSeconds ?? scrubSec, outVal);
                      savePanelOverrideById(panel.id, clamped);
                      onChange({ ...panel, ...clamped });
                    }}
                    className="w-full bg-black/40 border border-purple-500/30 rounded px-1.5 py-0.5 text-[10px] text-white font-mono"
                  />
                </label>
              </div>
              <div className="flex gap-1">
                {(['loop', 'ping-pong', 'subtle'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      savePanelOverrideById(panel.id, { cinemagraphMode: m });
                      onChange({ ...panel, cinemagraphMode: m });
                    }}
                    className={`flex-1 py-1 rounded text-[8px] font-bold uppercase border ${
                      (panel.cinemagraphMode || 'loop') === m
                        ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                        : 'border-white/10 text-white/40'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center justify-center gap-1.5 cursor-pointer px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs transition-colors">
            <Upload size={11} /> Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !auth.currentUser) return;
                const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                savePanelOverrideById(panel.id, { imageUrl: url });
                onChange({ ...panel, imageUrl: url });
              }}
            />
          </label>
          <button
            onClick={onDraw}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 text-xs transition-colors"
          >
            <Brush size={11} /> Draw
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main comic panel builder ─────────────────────────────────────────────────

interface Props {
  page: StudioPage;
  onChange: (p: StudioPage) => void;
  isManga: boolean;
  currentPageIndex?: number;
  totalPages?: number;
  onNavigatePage?: (delta: number) => void;
  onOpenInLorea?: () => void;
  allPages?: StudioPage[];
  onUpdateAnyPage?: (p: StudioPage, idx?: number) => void;
  onSelectPageIndex?: (idx: number) => void;
  bookTitle?: string;
  bookAuthor?: string;
}

const CANVAS_W = 800;
const CANVAS_H = 1100;

export default function ComicPanelBuilder({
  page,
  onChange,
  isManga,
  currentPageIndex,
  totalPages,
  onNavigatePage,
  onOpenInLorea,
  allPages,
  onUpdateAnyPage,
  onSelectPageIndex,
  bookTitle,
  bookAuthor,
}: Props) {
  const [studioCanvasMode, setStudioCanvasMode] = useState<'COUNCIL_V4' | 'KONVA_VECTOR'>('COUNCIL_V4');
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [handReframePanelId, setHandReframePanelId] = useState<string | null>(null);
  const [inlineEditorTarget, setInlineEditorTarget] = useState<{
    panelId: string;
    targetId: string; // bubbleId or '__CAPTION__' or '__SFX__'
  } | null>(null);
  const [imagePanMode, setImagePanMode] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{ panelId: string; x: number; y: number } | null>(null);
  const [ctxScrubSec, setCtxScrubSec] = useState<number>(120);
  const [ctxScrubSaving, setCtxScrubSaving] = useState<boolean>(false);
  const [isBW, setIsBW] = useState(page.colorMode === 'bw' || isManga);
  const [gutter, setGutter] = useState(page.panelGutter ?? 6);
  const [scale, setScale] = useState(0.65);
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);


  const panels = page.panels ?? [];
  const selectedPanel = panels.find(p => p.id === selectedPanelId) ?? null;
  const handReframePanel = panels.find(p => p.id === handReframePanelId) ?? null;
  const contextPanel = panels.find(p => p.id === contextMenu?.panelId) ?? null;

  // Allow pressing Escape to exit Hand-Style Reframe Mode or close inline text editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineEditorTarget) {
          setInlineEditorTarget(null);
        } else if (handReframePanelId) {
          setHandReframePanelId(null);
          setImagePanMode(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inlineEditorTarget, handReframePanelId]);

  const updatePanel = (updated: StudioPanel) => {
    onChange({ ...page, panels: panels.map(p => p.id === updated.id ? updated : p) });
  };

  const updateBubbleOnActivePanel = (bubbleId: string, updates: Partial<SpeechBubble>) => {
    const targetPanel = selectedPanel || handReframePanel;
    if (!targetPanel) return;
    const updatedBubbles = targetPanel.bubbles.map(b => b.id === bubbleId ? { ...b, ...updates } : b);
    savePanelOverrideById(targetPanel.id, { bubbles: updatedBubbles });
    updatePanel({ ...targetPanel, bubbles: updatedBubbles });
  };

  const handleEngageHandReframe = (
    panelId: string,
    bubbleOrTargetId?: string | null,
    openInlineTextEditor = false
  ) => {
    setSelectedPanelId(panelId);
    setHandReframePanelId(panelId);
    setImagePanMode(true);
    if (bubbleOrTargetId && bubbleOrTargetId !== '__CAPTION__' && bubbleOrTargetId !== '__SFX__') {
      setSelectedBubbleId(bubbleOrTargetId);
    }
    if (openInlineTextEditor && bubbleOrTargetId) {
      setInlineEditorTarget({ panelId, targetId: bubbleOrTargetId });
    }
  };

  const addPanel = () => {
    const maxX = panels.reduce((m, p) => Math.max(m, p.x + p.width), 0);
    const newPanel: StudioPanel = {
      id: uuidv4(),
      x: maxX > 80 ? 0 : maxX,
      y: maxX > 80 ? panels.reduce((m, p) => Math.max(m, p.y + p.height), 0) : 0,
      width: 50, height: 50,
      bgColor: isBW ? '#1a1a1a' : '#111',
      bubbles: [],
      borderStyle: 'solid',
      shape: 'rect',
    };
    onChange({ ...page, panels: [...panels, newPanel] });
    setSelectedPanelId(newPanel.id);
  };

  const deletePanel = (id: string) => {
    onChange({ ...page, panels: panels.filter(p => p.id !== id) });
    if (selectedPanelId === id) setSelectedPanelId(null);
    if (handReframePanelId === id) setHandReframePanelId(null);
  };

  const [showLayouts, setShowLayouts] = useState(panels.length === 0);
  const [uploading, setUploading] = useState(false);

  // Script → panels (character-tagged; may arrive from Fabula/Lorea via a handoff).
  const [showScript, setShowScript] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [handoffChars, setHandoffChars] = useState<ScriptCharacter[]>([]);
  const [handoffAssets, setHandoffAssets] = useState<{ name: string; url: string }[]>([]);
  const [handoffSource, setHandoffSource] = useState<string | null>(null);
  useEffect(() => {
    const h = takeComicHandoff();
    if (h) {
      if (h.script) {
        setScriptText(h.script);
        setStoryIntelInput(h.script);
      }
      if (h.characters?.length) setHandoffChars(h.characters);
      if (h.assets?.length) setHandoffAssets(h.assets);
      setHandoffSource(h.source);
      setShowScript(true);
    }
  }, []);
  const scriptBeats = scriptText.trim() ? parseScript(scriptText) : [];
  const scriptCast = charactersInScript(scriptBeats);

  const applyScript = () => {
    if (!scriptBeats.length) return;
    onChange(applyScriptToPage(page, scriptBeats, { isManga, characters: handoffChars, assets: handoffAssets }));
    setShowScript(false);
    setSelectedPanelId(null);
  };

  // Story Intelligence on-device engine v2.0 (Gemma 2 2B + Meta Muse Spark + Nemotron 4B + Cascade)
  const [showStoryIntel, setShowStoryIntel] = useState(false);
  const [storyIntelInput, setStoryIntelInput] = useState('');
  const [storyIntelModel, setStoryIntelModel] = useState<'cascade' | 'muse-spark' | 'gemma-2-2b' | 'nemotron-4b'>('cascade');
  const [storyIntelStyle, setStoryIntelStyle] = useState<'manga' | 'comic_western' | 'storybook_watercolor'>(isManga ? 'manga' : 'comic_western');
  const [storyIntelLoading, setStoryIntelLoading] = useState(false);
  const [storyIntelIllustrating, setStoryIntelIllustrating] = useState(false);
  const [storyIntelResult, setStoryIntelResult] = useState<StoryBreakdownResult | null>(null);
  const [storyCouncilResult, setStoryCouncilResult] = useState<StoryCouncilCritiqueResult | null>(null);
  const [storyIntelTab, setStoryIntelTab] = useState<'decompose' | 'council'>('decompose');

  const handleDeconstructStory = async () => {
    if (!storyIntelInput.trim()) return;
    setStoryIntelLoading(true);
    try {
      const res = await decomposeProseToComicBeatsAsync(storyIntelInput, {
        title: page.chapterTitle || 'Scene Breakdown',
        style: storyIntelStyle,
        modelPreference: storyIntelModel,
        characterBible: handoffChars.map(c => ({
          name: c.name,
          look: c.look || c.role || 'distinctive protagonist',
          role: c.role || 'Cast',
        })),
      });
      setStoryIntelResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setStoryIntelLoading(false);
    }
  };

  const handleRunCouncil = async () => {
    if (!storyIntelInput.trim()) return;
    setStoryIntelLoading(true);
    try {
      const councilModel = storyIntelModel === 'gemma-2-2b' ? 'gemma-2-2b' : storyIntelModel === 'nemotron-4b' ? 'nemotron-4b' : 'muse-spark';
      const res = await requestStoryCouncilCritique(storyIntelInput, undefined, councilModel);
      setStoryCouncilResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setStoryIntelLoading(false);
    }
  };

  const buildPanelsFromIntelResult = (): StudioPanel[] => {
    if (!storyIntelResult || !storyIntelResult.beats.length) return [];

    // Expand beats so long strings of dialogue are split across sequential panels (max 2 compact balloons per panel)
    const expandedBeats: Array<{
      baseBeat: (typeof storyIntelResult.beats)[number];
      subIndex: number;
      dialogueSlice: Array<{ speaker: string; text: string; type: string; tailDirection?: string }>;
    }> = [];

    for (const b of storyIntelResult.beats) {
      const splitLines: Array<{ speaker: string; text: string; type: string; tailDirection?: string }> = [];
      for (const d of b.dialogueLines || []) {
        const clauses = splitSpokenLineIntoComicClauses(d.text || '', 100);
        clauses.forEach((clauseText) => {
          splitLines.push({
            speaker: d.speaker,
            text: clauseText,
            type: d.type,
            tailDirection: d.tailDirection,
          });
        });
      }
      if (splitLines.length <= 2) {
        expandedBeats.push({ baseBeat: b, subIndex: 0, dialogueSlice: splitLines });
      } else {
        for (let i = 0; i < splitLines.length; i += 2) {
          expandedBeats.push({
            baseBeat: b,
            subIndex: Math.floor(i / 2),
            dialogueSlice: splitLines.slice(i, i + 2),
          });
        }
      }
    }

    const count = expandedBeats.length;
    const allLayouts = layoutsFor(isManga);
    const dynamicPreferredIds = isManga
      ? ['manga-dynamic', 'manga-reaction', 'manga-action', 'manga-silence', 'manga-4', 'action-diagonal', 'cinematic-5']
      : ['action-diagonal', 'cinematic-5', 'hero-strip', 'inset-reveal', 'classic', 'manga-dynamic', 'manga-reaction'];

    const matchedDynamic =
      dynamicPreferredIds
        .map((id) => allLayouts.find((l) => l.id === id))
        .find((l) => l && l.panels.length === count) ||
      allLayouts.find((l) => l.panels.length === count && l.id !== 'grid-4' && l.id !== 'grid-6') ||
      allLayouts.find((l) => l.id === (isManga ? 'manga-dynamic' : 'action-diagonal')) ||
      allLayouts[0];

    const newPanels = panelsFromLayout(matchedDynamic.panels, panels, isBW);
    const charImgMap = new Map(
      handoffChars.filter((c) => c.imageUrl).map((c) => [c.name.toLowerCase(), c.imageUrl!])
    );

    expandedBeats.slice(0, newPanels.length).forEach((item, idx) => {
      const b = item.baseBeat;
      const p = newPanels[idx];
      if (!p) return;

      // Transliterate cinematic script direction into a true comic caption (or omit if dialogue-heavy)
      const capObj =
        item.subIndex === 0
          ? transliterateActionToComicCaption(
              b.actionSummary || '',
              b.environment || '',
              idx === 0,
              item.dialogueSlice.length >= 2
            )
          : null;

      p.caption = capObj
        ? capObj.header
          ? `${capObj.header} — ${capObj.body}`
          : capObj.body
        : undefined;
      p.originalScriptCaption = p.caption;
      p.useAltCaptionLayer = false;
      p.captionPos = idx === 0 ? 'top' : 'bottom';

      if (b.suggestedSfx && item.subIndex === 0) {
        p.sfxText = b.suggestedSfx;
        p.originalScriptSfx = b.suggestedSfx;
        p.useAltSfxLayer = false;
        p.sfxStyle = 'impact';
      }

      // Face & Key-Action Safe-Zone placement so balloons NEVER obscure character faces or focal action
      p.bubbles = item.dialogueSlice.map((d, bIdx) => {
        const safe = computeSafeBalloonPlacement({
          bubbleIndex: bIdx,
          totalBubblesInPanel: item.dialogueSlice.length,
          textLength: (d.text || '').length,
          framing: b.cameraAngle,
          actionDescription: b.actionDescription,
        });
        return {
          id: uuidv4(),
          text: d.text,
          originalScriptText: d.text,
          useAltTextLayer: false,
          speakerName: d.speaker,
          character: d.speaker,
          type: (d.type as any) || 'speech',
          x: safe.x,
          y: safe.y,
          width: safe.width,
          scale: 1,
          tailDir: safe.tailDir,
          fontSize: 10.5,
        };
      });

      // Auto-populate artwork from character bible or handoff scene stills if not already set
      if (!p.imageUrl) {
        const primarySpeaker = item.dialogueSlice[0]?.speaker || b.charactersPresent?.[0];
        if (primarySpeaker && charImgMap.has(primarySpeaker.toLowerCase())) {
          p.imageUrl = charImgMap.get(primarySpeaker.toLowerCase());
        } else if (handoffAssets.length > 0) {
          p.imageUrl = handoffAssets[idx % handoffAssets.length].url;
        }
      }
    });
    return newPanels;
  };

  const enforcePageSafeZonePlacement = () => {
    const updatedPanels = page.panels.map(p => ({
      ...p,
      bubbles: (p.bubbles || []).map((b, bIdx) => {
        const safe = computeSafeBalloonPlacement({
          bubbleIndex: bIdx,
          totalBubblesInPanel: p.bubbles.length,
          textLength: (b.text || '').length,
          actionDescription: p.aiPrompt || '',
        });
        return {
          ...b,
          x: safe.x,
          y: safe.y,
          width: safe.width,
          tailDir: safe.tailDir,
        };
      }),
    }));
    onChange({ ...page, panels: updatedPanels });
  };

  const handleApplyIntelToPage = () => {
    const newPanels = buildPanelsFromIntelResult();
    if (!newPanels.length) return;
    onChange({
      ...page,
      panels: newPanels,
      colorMode: isBW ? 'bw' : 'color',
    });
    setShowStoryIntel(false);
    setSelectedPanelId(null);
  };

  const handleApplyAndIllustrateOnGpu = async () => {
    if (!storyIntelResult || !storyIntelResult.beats.length) return;
    const newPanels = buildPanelsFromIntelResult();
    if (!newPanels.length) return;

    setStoryIntelIllustrating(true);
    onChange({
      ...page,
      panels: newPanels,
      colorMode: isBW ? 'bw' : 'color',
    });

    try {
      const illustrated = [...newPanels];
      for (let i = 0; i < illustrated.length; i++) {
        const beat = storyIntelResult.beats[i];
        if (!beat) continue;
        const prompt = beat.diffusionPrompt || `${beat.cameraShot} shot, ${beat.actionSummary}, ${beat.environment}, comic book illustration`;
        try {
          const res = await fetch('http://127.0.0.1:51122/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              negative_prompt: 'blurry, deformed, bad anatomy, watermark, text, speech bubble',
              width: 768,
              height: 768,
              steps: 6,
              cfg: 2.0,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.imageDataUrl) {
              illustrated[i] = { ...illustrated[i], imageUrl: data.imageDataUrl };
              onChange({
                ...page,
                panels: [...illustrated],
                colorMode: isBW ? 'bw' : 'color',
              });
            }
          }
        } catch {
          // Continue if individual panel render skips
        }
      }
    } finally {
      setStoryIntelIllustrating(false);
      setShowStoryIntel(false);
      setSelectedPanelId(null);
    }
  };

  // Draw the selected panel's art on the paint canvas → upload → set as its image.
  const [drawingPanelId, setDrawingPanelId] = useState<string | null>(null);
  const drawingPanel = panels.find(p => p.id === drawingPanelId) || null;
  const saveDrawing = async (blob: Blob) => {
    if (!drawingPanel || !auth.currentUser) return;
    const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_panel.png`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    updatePanel({ ...drawingPanel, imageUrl: url });
    setDrawingPanelId(null);
  };

  // Apply a preset layout to the page (keeps existing art by index).
  const applyLayout = (layout: ComicLayout) => {
    onChange({ ...page, panels: panelsFromLayout(layout.panels, panels, isBW) });
    setSelectedPanelId(null);
    setShowLayouts(false);
  };

  // Reading order (matches how the page renders / exports).
  const readingOrder = (list: StudioPanel[]) => isManga
    ? [...list].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...list].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  const deselect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === stageRef.current) {
      setSelectedPanelId(null);
      setSelectedBubbleId(null);
      setHandReframePanelId(null);
      setInlineEditorTarget(null);
      setImagePanMode(false);
    }
  };

  // Render panels in RTL order for manga
  const orderedPanels = isManga
    ? [...panels].sort((a, b) => a.x !== b.x ? b.x - a.x : a.y - b.y)
    : [...panels].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  return (
    <div className="flex h-full" style={{ backgroundColor: page.bgColor ?? '#0a0a0a' }}>
      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/40 shrink-0 overflow-x-auto no-scrollbar">
          {/* Quick Page Navigation */}
          {totalPages !== undefined && currentPageIndex !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs shrink-0">
              <button
                onClick={() => onNavigatePage && onNavigatePage(-1)}
                disabled={currentPageIndex <= 0}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-white/60 hover:text-white transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-bold text-white/80 px-1 whitespace-nowrap">
                Page {currentPageIndex + 1} of {totalPages}
              </span>
              <button
                onClick={() => onNavigatePage && onNavigatePage(1)}
                disabled={currentPageIndex >= totalPages - 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-20 text-white/60 hover:text-white transition-colors"
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Council V4 Living Graphic Novel vs Konva Vector Canvas Switcher */}
          <div className="flex items-center bg-black/60 border border-amber-500/30 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setStudioCanvasMode('COUNCIL_V4')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black transition-all flex items-center gap-1 whitespace-nowrap ${
                studioCanvasMode === 'COUNCIL_V4'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow'
                  : 'text-amber-300/70 hover:text-amber-200'
              }`}
              title="Council V4 Living Graphic Novel Studio View (Multi-tier choreography, double-click Hand Reframe, non-destructive Alt Text Layer, ±60s frame scrubber & video loops)"
            >
              ✨ Council V4 Studio
            </button>
            <button
              onClick={() => setStudioCanvasMode('KONVA_VECTOR')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 whitespace-nowrap ${
                studioCanvasMode === 'KONVA_VECTOR'
                  ? 'bg-white/20 text-white'
                  : 'text-white/50 hover:text-white'
              }`}
              title="Switch to Freeform Konva Vector Canvas"
            >
              🎨 Vector Canvas
            </button>
          </div>

          <button onClick={() => setShowLayouts(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${showLayouts ? 'bg-orange-500 text-black' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'}`}>
            <LayoutGrid size={12} /> Layouts
          </button>
          <button onClick={() => setShowScript(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors">
            <Type size={12} /> Script
          </button>

          <button
            onClick={() => setShowStoryIntel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/40 text-purple-300 hover:from-purple-500/30 hover:to-indigo-500/30 text-xs font-bold transition-all shadow-sm shrink-0"
            title="Plajah Story Intelligence (Gemma 2 2B & Nemotron 4B on NVIDIA GPU)"
          >
            <Sparkles size={12} className="text-purple-400" /> Story Intelligence
          </button>
          <button
            onClick={enforcePageSafeZonePlacement}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition-all shrink-0"
            title="Enforce Hard Lettering Rule: Dock all speech balloons into negative space & gutter rails so 0 faces or key actions are obstructed"
          >
            🛡️ Face/Action Safe-Zone
          </button>
          <button
            onClick={() => {
              const next = !imagePanMode;
              setImagePanMode(next);
              if (next && selectedPanelId) {
                setHandReframePanelId(selectedPanelId);
              } else if (!next) {
                setHandReframePanelId(null);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
              imagePanMode || handReframePanelId
                ? 'bg-amber-500 text-black border border-amber-400 shadow-sm'
                : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'
            }`}
            title="Double-click inside any panel (or click here) to engage the Hand Reframe Tool: freely pan/scale image, move/scale text bubbles, and rewrite text onto an Alt Layer"
          >
            <Hand size={12} /> {imagePanMode || handReframePanelId ? 'Hand Reframe (Active)' : 'Hand Reframe (Dbl-Click Panel)'}
          </button>
          <button onClick={addPanel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-colors">
            <Plus size={12} /> Panel
          </button>
          <button onClick={() => { if (selectedPanelId) deletePanel(selectedPanelId); }}
            disabled={!selectedPanelId}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs disabled:opacity-30 hover:bg-red-500/20 transition-colors">
            <Trash2 size={12} /> Delete
          </button>

          <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />

          {/* B&W toggle */}
          <button onClick={() => { setIsBW(v => !v); onChange({ ...page, colorMode: isBW ? 'color' : 'bw' }); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${isBW ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
            {isBW ? <Moon size={12} /> : <Sun size={12} />}
            {isBW ? 'B&W' : 'Color'}
          </button>

          {/* Gutter */}
          <label className="flex items-center gap-2 text-xs text-white/40 shrink-0">
            Gutter
            <input type="range" min={0} max={20} value={gutter}
              onChange={e => { const v = Number(e.target.value); setGutter(v); onChange({ ...page, panelGutter: v }); }}
              className="w-16 accent-orange-500" />
            <span className="text-white/30 w-4">{gutter}</span>
          </label>

          {/* Lorea Reader Link */}
          {onOpenInLorea && (
            <button
              onClick={onOpenInLorea}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 text-xs font-bold transition-all shadow-sm shrink-0 ml-1"
              title="Preview in Lorea Reader"
            >
              <BookOpen size={12} /> Read in Lorea
            </button>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><ZoomOut size={13} /></button>
            <span className="text-xs text-white/30 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(1.5, s + 0.1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"><ZoomIn size={13} /></button>
          </div>
        </div>

        {/* Active Hand-Style Reframe & Alt Text Layer Floating HUD Bar */}
        {handReframePanel && (
          <div className="shrink-0 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-black/60 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 text-black font-black text-[10px] uppercase tracking-wider">
                <Hand size={12} /> Hand Reframe Mode Active
              </span>
              <span className="text-[11px] text-white/75">
                Drag inside panel to pan image · Scroll wheel to scale ({Math.round((handReframePanel.imageScale ?? 1) * 100)}%) · Drag text bubbles/captions to arrange · Double-click any text to rewrite on Alt Layer
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Quick Image Scale controls */}
              <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg px-2 py-0.5">
                <span className="text-[9px] uppercase font-bold text-white/40 mr-1">Art Scale</span>
                <button
                  onClick={() => {
                    const next = Math.max(0.5, +((handReframePanel.imageScale ?? 1) - 0.1).toFixed(2));
                    savePanelOverrideById(handReframePanel.id, { imageScale: next });
                    updatePanel({ ...handReframePanel, imageScale: next });
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-white text-[10px] font-mono"
                >
                  -
                </button>
                <span className="text-[10px] font-mono text-amber-300 w-10 text-center">
                  {Math.round((handReframePanel.imageScale ?? 1) * 100)}%
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(3.5, +((handReframePanel.imageScale ?? 1) + 0.1).toFixed(2));
                    savePanelOverrideById(handReframePanel.id, { imageScale: next });
                    updatePanel({ ...handReframePanel, imageScale: next });
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-white text-[10px] font-mono"
                >
                  +
                </button>
                <button
                  onClick={() => {
                    savePanelOverrideById(handReframePanel.id, { imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
                    updatePanel({ ...handReframePanel, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
                  }}
                  className="ml-1 text-[9px] text-amber-300 hover:underline"
                >
                  Reset
                </button>
              </div>

              {/* Quick Rewrite Text Button */}
              {(handReframePanel.bubbles.length > 0 || handReframePanel.caption) && (
                <button
                  onClick={() => {
                    const firstTarget =
                      selectedBubbleId && handReframePanel.bubbles.some(b => b.id === selectedBubbleId)
                        ? selectedBubbleId
                        : handReframePanel.bubbles[0]?.id || '__CAPTION__';
                    setInlineEditorTarget({ panelId: handReframePanel.id, targetId: firstTarget });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-bold text-[10px]"
                >
                  ✍️ Rewrite Text (Alt Layer)
                </button>
              )}

              {/* Toggle Original Script vs Alt Layer */}
              <button
                onClick={() => {
                  const nextMode = handReframePanel.textLayerMode === 'script' ? 'alt' : 'script';
                  updatePanel(switchPanelTextLayerMode(handReframePanel, nextMode));
                }}
                className={`px-2.5 py-1 rounded-lg font-black text-[10px] uppercase border transition-colors ${
                  handReframePanel.textLayerMode === 'script'
                    ? 'bg-slate-700 border-slate-400 text-white'
                    : 'bg-emerald-500 text-black border-emerald-400'
                }`}
              >
                {handReframePanel.textLayerMode === 'script'
                  ? '📜 Viewing Original Script (Click for Alt)'
                  : '✨ Alt Layer Active (Click for Script)'}
              </button>

              <button
                onClick={() => {
                  setHandReframePanelId(null);
                  setInlineEditorTarget(null);
                  setImagePanMode(false);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-bold text-[10px]"
              >
                Done (Esc)
              </button>
            </div>
          </div>
        )}

        {/* Layout template strip */}
        {showLayouts && (
          <div className="shrink-0 border-b border-white/5 bg-black/40 px-4 py-3 overflow-x-auto">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">{isManga ? 'Manga & comic layouts' : 'Comic & manga layouts'} — pick a page template</p>
            <div className="flex gap-2">
              {layoutsFor(isManga).map(layout => (
                <button key={layout.id} onClick={() => applyLayout(layout)} title={layout.name}
                  className="shrink-0 group flex flex-col items-center gap-1">
                  <div className="relative w-14 h-[76px] rounded-md bg-white/[0.06] border border-white/10 group-hover:border-orange-500/60 overflow-hidden transition-colors">
                    {layout.panels.map((p, i) => (
                      <div key={i} className="absolute bg-white/20 group-hover:bg-orange-400/40 border border-black/40 transition-colors"
                        style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%` }} />
                    ))}
                  </div>
                  <span className="text-[8px] font-bold text-white/35 group-hover:text-white/70 max-w-[56px] truncate">{layout.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Council V4 Living Graphic Novel Studio View OR Konva Vector Canvas */}
        <div
          ref={containerRef}
          className={`flex-1 overflow-auto relative ${
            studioCanvasMode === 'COUNCIL_V4' ? 'p-0' : 'flex items-start justify-center p-6'
          }`}
          style={{ backgroundColor: isBW ? '#222' : '#181818' }}
          onClick={() => { if (contextMenu) setContextMenu(null); }}
        >
          {studioCanvasMode === 'COUNCIL_V4' ? (
            <CouncilV4GraphicNovelStudioView
              pages={allPages && allPages.length > 0 ? allPages : [page]}
              activePageIndex={currentPageIndex ?? 0}
              onSelectPageIndex={(idx) => {
                if (onSelectPageIndex) {
                  onSelectPageIndex(idx);
                } else if (onNavigatePage && currentPageIndex !== undefined) {
                  onNavigatePage(idx - currentPageIndex);
                }
              }}
              onUpdatePage={(updatedStudioPage, idx) => {
                if (onUpdateAnyPage) {
                  onUpdateAnyPage(updatedStudioPage, idx);
                } else {
                  onChange(updatedStudioPage);
                }
              }}
              selectedPanelId={selectedPanelId}
              onSelectPanel={(panelId, _panelIdx, pageIdx) => {
                if (onSelectPageIndex && currentPageIndex !== undefined && pageIdx !== currentPageIndex) {
                  onSelectPageIndex(pageIdx);
                }
                setSelectedPanelId(panelId);
              }}
              bookTitle={bookTitle || page.chapterTitle || 'GRAPHIC NOVEL STUDIO'}
              bookAuthor={bookAuthor || 'Council V4 Living Graphic Novel Studio'}
            />
          ) : (
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
              <Stage
                ref={stageRef}
                width={CANVAS_W}
                height={CANVAS_H}
                style={{ background: page.bgColor ?? '#0a0a0a', borderRadius: 6, boxShadow: '0 0 50px rgba(0,0,0,0.8)' }}
                onMouseDown={e => {
                  if (contextMenu) setContextMenu(null);
                  deselect(e);
                }}
                onTouchStart={deselect as any}
              >
                <Layer>
                  {/* Page background */}
                  <Rect width={CANVAS_W} height={CANVAS_H} fill={page.bgColor ?? '#0a0a0a'} />

                  {/* Panels */}
                  {orderedPanels.map(panel => (
                    <PanelNode
                      key={panel.id}
                      panel={panel}
                      canvasW={CANVAS_W}
                      canvasH={CANVAS_H}
                      selected={panel.id === selectedPanelId}
                      selectedBubbleId={selectedBubbleId}
                      isHandReframing={panel.id === handReframePanelId}
                      onSelect={() => {
                        setSelectedPanelId(panel.id);
                      }}
                      onEngageHandReframe={handleEngageHandReframe}
                      onSelectBubble={(bubbleId) => {
                        setSelectedPanelId(panel.id);
                        setSelectedBubbleId(bubbleId);
                      }}
                      onUpdateBubble={updateBubbleOnActivePanel}
                      onChange={updatePanel}
                      onContextMenuPanel={(pnl, cx, cy) => {
                        setSelectedPanelId(pnl.id);
                        setCtxScrubSec(pnl.timecodeSeconds ?? pnl.anchorTimecodeSeconds ?? 120);
                        setContextMenu({
                          panelId: pnl.id,
                          x: Math.min(window.innerWidth - 340, Math.max(12, cx)),
                          y: Math.min(window.innerHeight - 460, Math.max(12, cy)),
                        });
                      }}
                      imagePanMode={imagePanMode || panel.id === handReframePanelId}
                      gutter={gutter}
                      isBW={isBW}
                    />
                  ))}

                  {/* Reading direction indicator for manga */}
                  {isManga && (
                    <Text
                      text="← 読む方向 (RTL Manga Flow)"
                      x={CANVAS_W - 160} y={12}
                      fontSize={11} fill="#ffffff50" fontStyle="bold"
                    />
                  )}
                </Layer>
              </Stage>
            </div>
          )}


          {/* Inline On-Canvas Alt-Layer Text Rewrite Modal (Triggered by Double-Clicking a Bubble/Caption/SFX in a Panel) */}
          {inlineEditorTarget && (() => {
            const targetPnl = panels.find(p => p.id === inlineEditorTarget.panelId);
            if (!targetPnl) return null;
            const isCap = inlineEditorTarget.targetId === '__CAPTION__';
            const isSfx = inlineEditorTarget.targetId === '__SFX__';
            const targetBubble =
              !isCap && !isSfx
                ? targetPnl.bubbles.find(b => b.id === inlineEditorTarget.targetId) || targetPnl.bubbles[0]
                : null;

            const currentText = isCap
              ? getEffectiveCaptionText(targetPnl) ?? ''
              : isSfx
              ? getEffectiveSfxText(targetPnl) ?? ''
              : targetBubble
              ? getEffectiveBubbleText(targetBubble, targetPnl.textLayerMode)
              : '';

            const origScriptText = isCap
              ? targetPnl.originalScriptCaption ?? targetPnl.caption ?? ''
              : isSfx
              ? targetPnl.originalScriptSfx ?? targetPnl.sfxText ?? ''
              : targetBubble
              ? targetBubble.originalScriptText ?? targetBubble.text ?? ''
              : '';

            const isCurrentlyUsingAlt = isCap
              ? Boolean(targetPnl.useAltCaptionLayer && targetPnl.textLayerMode !== 'script')
              : isSfx
              ? Boolean(targetPnl.useAltSfxLayer && targetPnl.textLayerMode !== 'script')
              : Boolean(targetBubble?.useAltTextLayer && targetPnl.textLayerMode !== 'script');

            return (
              <div
                className="fixed z-[520] top-24 left-1/2 -translate-x-1/2 w-full max-w-md rounded-2xl bg-[#101218]/95 border border-emerald-500/50 shadow-2xl backdrop-blur-xl p-4 text-white space-y-3"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-black font-black text-[9px] uppercase tracking-wider">
                      ✍️ Alt Layer Text Studio
                    </span>
                    <span className="text-[10px] font-bold text-white/70">
                      {isCap
                        ? 'Narrative Caption'
                        : isSfx
                        ? 'Panel SFX'
                        : `Bubble (${targetBubble?.character || targetBubble?.type || 'Speech'})`}
                    </span>
                  </div>
                  <button
                    onClick={() => setInlineEditorTarget(null)}
                    className="text-white/40 hover:text-white p-1"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Switch between all bubbles / caption on this panel */}
                <div className="flex flex-wrap gap-1">
                  {targetPnl.bubbles.map((b, idx) => (
                    <button
                      key={b.id}
                      onClick={() => setInlineEditorTarget({ panelId: targetPnl.id, targetId: b.id })}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-colors ${
                        targetBubble?.id === b.id
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      💬 {b.character || `Bubble ${idx + 1}`}
                      {b.useAltTextLayer && targetPnl.textLayerMode !== 'script' ? ' (ALT)' : ''}
                    </button>
                  ))}
                  <button
                    onClick={() => setInlineEditorTarget({ panelId: targetPnl.id, targetId: '__CAPTION__' })}
                    className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-colors ${
                      isCap
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    📝 Caption
                  </button>
                  <button
                    onClick={() => setInlineEditorTarget({ panelId: targetPnl.id, targetId: '__SFX__' })}
                    className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-colors ${
                      isSfx
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    ⚡ SFX
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-emerald-300 font-bold uppercase tracking-wider">
                      {isCurrentlyUsingAlt
                        ? '✨ Editing Alt Layer (Original Script Turned Off)'
                        : '📜 Viewing Original Script (Type below to create Alt Layer)'}
                    </span>
                    {origScriptText && (
                      <button
                        onClick={() => {
                          if (isCap) {
                            const nextUseAlt = !isCurrentlyUsingAlt;
                            const nextCap =
                              nextUseAlt && targetPnl.altCaption !== undefined
                                ? targetPnl.altCaption
                                : origScriptText;
                            savePanelOverrideById(targetPnl.id, {
                              useAltCaptionLayer: nextUseAlt,
                              caption: nextCap,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                            updatePanel({
                              ...targetPnl,
                              useAltCaptionLayer: nextUseAlt,
                              caption: nextCap,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                          } else if (isSfx) {
                            const nextUseAlt = !isCurrentlyUsingAlt;
                            const nextSfx =
                              nextUseAlt && targetPnl.altSfx !== undefined
                                ? targetPnl.altSfx
                                : origScriptText;
                            savePanelOverrideById(targetPnl.id, {
                              useAltSfxLayer: nextUseAlt,
                              sfxText: nextSfx,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                            updatePanel({
                              ...targetPnl,
                              useAltSfxLayer: nextUseAlt,
                              sfxText: nextSfx,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                          } else if (targetBubble) {
                            const nextUseAlt = !isCurrentlyUsingAlt;
                            const toggled = toggleBubbleScriptLayer(targetBubble, nextUseAlt);
                            const nextBubbles = targetPnl.bubbles.map(b =>
                              b.id === targetBubble.id ? toggled : b
                            );
                            savePanelOverrideById(targetPnl.id, {
                              bubbles: nextBubbles,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                            updatePanel({
                              ...targetPnl,
                              bubbles: nextBubbles,
                              textLayerMode: nextUseAlt ? 'alt' : 'script',
                            });
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-amber-300 font-bold flex items-center gap-1"
                      >
                        <RotateCcw size={10} />
                        {isCurrentlyUsingAlt ? 'Return to Script Version' : 'Switch to Alt Layer'}
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    autoFocus
                    value={currentText}
                    onChange={e => {
                      const val = e.target.value;
                      if (isCap) {
                        savePanelOverrideById(targetPnl.id, {
                          originalScriptCaption: origScriptText,
                          altCaption: val,
                          useAltCaptionLayer: true,
                          caption: val,
                          textLayerMode: 'alt',
                        });
                        updatePanel({
                          ...targetPnl,
                          originalScriptCaption: origScriptText,
                          altCaption: val,
                          useAltCaptionLayer: true,
                          caption: val,
                          textLayerMode: 'alt',
                        });
                      } else if (isSfx) {
                        savePanelOverrideById(targetPnl.id, {
                          originalScriptSfx: origScriptText,
                          altSfx: val,
                          useAltSfxLayer: true,
                          sfxText: val,
                          textLayerMode: 'alt',
                        });
                        updatePanel({
                          ...targetPnl,
                          originalScriptSfx: origScriptText,
                          altSfx: val,
                          useAltSfxLayer: true,
                          sfxText: val,
                          textLayerMode: 'alt',
                        });
                      } else if (targetBubble) {
                        const updatedB = applyAltTextEditToBubble(targetBubble, val);
                        const nextBubbles = targetPnl.bubbles.map(b =>
                          b.id === targetBubble.id ? updatedB : b
                        );
                        savePanelOverrideById(targetPnl.id, {
                          bubbles: nextBubbles,
                          textLayerMode: 'alt',
                        });
                        updatePanel({
                          ...targetPnl,
                          textLayerMode: 'alt',
                          bubbles: nextBubbles,
                        });
                      }
                    }}
                    className="w-full bg-black/60 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400 resize-none"
                    placeholder="Type rewritten dialogue or caption here..."
                  />

                  {origScriptText && (
                    <div className="p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] text-white/55 flex items-start justify-between gap-2">
                      <div>
                        <span className="font-black uppercase text-[8px] text-white/40 block">
                          📜 Preserved Original Script Version (Hidden while Alt is active):
                        </span>
                        <span className="italic">&ldquo;{origScriptText}&rdquo;</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bubble Scale & Width quick sliders when editing a bubble */}
                {targetBubble && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/10">
                    <label className="block">
                      <div className="flex justify-between text-[9px] text-white/50">
                        <span>Bubble Width</span>
                        <span>{targetBubble.width}%</span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={92}
                        value={targetBubble.width}
                        onChange={e =>
                          updateBubbleOnActivePanel(targetBubble.id, { width: Number(e.target.value) })
                        }
                        className="w-full accent-amber-500"
                      />
                    </label>
                    <label className="block">
                      <div className="flex justify-between text-[9px] text-white/50">
                        <span>Bubble Scale</span>
                        <span>{Math.round((targetBubble.scale ?? 1) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={180}
                        step={5}
                        value={Math.round((targetBubble.scale ?? 1) * 100)}
                        onChange={e =>
                          updateBubbleOnActivePanel(targetBubble.id, {
                            scale: Number(e.target.value) / 100,
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setInlineEditorTarget(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider flex items-center gap-1"
                  >
                    <Check size={12} /> Keep Alt Layer
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right-Click Interactive Panel Context Menu */}
        {contextMenu && contextPanel && (() => {
          const anchor = contextPanel.anchorTimecodeSeconds ?? contextPanel.timecodeSeconds ?? 120;
          const bounds = getPanelScrubBounds(anchor);
          return (
            <div
              className="fixed z-[500] w-80 rounded-2xl bg-[#111217]/95 border border-orange-500/40 shadow-2xl backdrop-blur-xl p-3.5 text-white space-y-3"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                    Panel Context Studio
                  </div>
                  <div className="text-[9px] font-mono text-white/50">
                    ID: {contextPanel.id.slice(0, 18)} · ⏱ {contextPanel.timecode || formatPanelTimecode(ctxScrubSec)}
                  </div>
                </div>
                <button onClick={() => setContextMenu(null)} className="text-white/40 hover:text-white">
                  <X size={13} />
                </button>
              </div>

              {/* 1. Panel Design & Shape */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/40 mb-1">
                  📐 Panel Design & Shape
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
                      ['rect', 'Rect'],
                      ['diag-right', 'Slant R'],
                      ['diag-left', 'Slant L'],
                      ['rounded', 'Round'],
                      ['circle-inset', 'Circle'],
                    ] as const
                  ).map(([sh, label]) => (
                    <button
                      key={sh}
                      onClick={() => {
                        savePanelOverrideById(contextPanel.id, { shape: sh });
                        updatePanel({ ...contextPanel, shape: sh });
                      }}
                      className={`py-1 rounded text-[9px] font-bold border transition-colors ${
                        (contextPanel.shape || 'rect') === sh
                          ? 'bg-orange-500 text-black border-orange-400'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Border Style */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/40 mb-1">
                  🖋️ Border Style
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {(['solid', 'thick', 'double', 'gold', 'neon', 'none'] as const).map(bs => (
                    <button
                      key={bs}
                      onClick={() => {
                        savePanelOverrideById(contextPanel.id, { borderStyle: bs });
                        updatePanel({ ...contextPanel, borderStyle: bs });
                      }}
                      className={`py-1 rounded text-[8px] font-bold uppercase border transition-colors ${
                        (contextPanel.borderStyle || 'solid') === bs
                          ? 'bg-orange-500/25 border-orange-400 text-orange-300'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      {bs}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. ±1 Minute Timeline Scrubber & New Still Capture */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-orange-300">
                    ⏱ Scrub Still (±1 Min)
                  </span>
                  <span className="text-[10px] font-mono font-bold text-white">
                    {formatPanelTimecode(ctxScrubSec)}
                  </span>
                </div>
                <input
                  type="range"
                  min={bounds.minSeconds}
                  max={bounds.maxSeconds}
                  step={0.1}
                  value={ctxScrubSec}
                  onChange={e => setCtxScrubSec(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[8px] font-mono text-white/40">
                  <span>-60s ({formatPanelTimecode(bounds.minSeconds)})</span>
                  <span>+60s ({formatPanelTimecode(bounds.maxSeconds)})</span>
                </div>
                <button
                  disabled={ctxScrubSaving}
                  onClick={async () => {
                    setCtxScrubSaving(true);
                    try {
                      const res = await createStillForPanelAtTimecode({
                        panelId: contextPanel.id,
                        targetSeconds: ctxScrubSec,
                        muxPlaybackId: contextPanel.muxPlaybackId,
                        sourceVideoUrl: contextPanel.sourceVideoUrl,
                        existingImageUrl: contextPanel.imageUrl,
                      });
                      updatePanel({
                        ...contextPanel,
                        imageUrl: res.imageUrl,
                        timecodeSeconds: res.timecodeSeconds,
                        timecode: res.timecode,
                      });
                    } finally {
                      setCtxScrubSaving(false);
                    }
                  }}
                  className="w-full py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-wider"
                >
                  {ctxScrubSaving ? 'Capturing Still…' : '📸 Set New Frame for Panel'}
                </button>
              </div>

              {/* 4. Create Cinemagraph / Live Video Loop (Up to 15s, Single Shared Master Video) */}
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-purple-300">
                    🔁 Cinemagraph / Video Loop (≤15s)
                  </span>
                  <button
                    onClick={() => {
                      const nextLoop = !contextPanel.isVideoLoop;
                      const baseIn = contextPanel.loopInSeconds ?? contextPanel.timecodeSeconds ?? ctxScrubSec;
                      const clamped = clampLoopInOutPoints(baseIn, contextPanel.loopOutSeconds ?? baseIn + 4);
                      savePanelOverrideById(contextPanel.id, {
                        isVideoLoop: nextLoop,
                        loopInSeconds: clamped.loopInSeconds,
                        loopOutSeconds: clamped.loopOutSeconds,
                      });
                      updatePanel({
                        ...contextPanel,
                        isVideoLoop: nextLoop,
                        loopInSeconds: clamped.loopInSeconds,
                        loopOutSeconds: clamped.loopOutSeconds,
                      });
                    }}
                    className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                      contextPanel.isVideoLoop ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {contextPanel.isVideoLoop ? 'ACTIVE' : 'CREATE LOOP'}
                  </button>
                </div>
                {contextPanel.isVideoLoop && (
                  <div className="grid grid-cols-3 gap-1">
                    {[3, 6, 10, 15].map(dur => (
                      <button
                        key={dur}
                        onClick={() => {
                          const baseIn = contextPanel.loopInSeconds ?? contextPanel.timecodeSeconds ?? ctxScrubSec;
                          const clamped = clampLoopInOutPoints(baseIn, baseIn + dur);
                          savePanelOverrideById(contextPanel.id, clamped);
                          updatePanel({ ...contextPanel, ...clamped });
                        }}
                        className="py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[9px] font-mono text-purple-200"
                      >
                        Loop {dur}s
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const nextMode =
                          contextPanel.cinemagraphMode === 'subtle' ? 'loop' : 'subtle';
                        savePanelOverrideById(contextPanel.id, { cinemagraphMode: nextMode });
                        updatePanel({ ...contextPanel, cinemagraphMode: nextMode });
                      }}
                      className="col-span-2 py-1 rounded bg-white/10 text-[9px] font-bold text-purple-200"
                    >
                      Mode: {(contextPanel.cinemagraphMode || 'loop').toUpperCase()}
                    </button>
                  </div>
                )}
              </div>

              {/* 5. Hand-Style Reframe Mode & Alt Text Layer Switch */}
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      handleEngageHandReframe(
                        contextPanel.id,
                        contextPanel.bubbles[0]?.id || '__CAPTION__',
                        false
                      );
                      setContextMenu(null);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-bold text-amber-300"
                  >
                    ✋ Engage Hand Reframe Tool
                  </button>
                  <button
                    onClick={() => {
                      savePanelOverrideById(contextPanel.id, { imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
                      updatePanel({ ...contextPanel, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 });
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/60"
                  >
                    Reset Fit
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      handleEngageHandReframe(
                        contextPanel.id,
                        contextPanel.bubbles[0]?.id || '__CAPTION__',
                        true
                      );
                      setContextMenu(null);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[10px] font-bold text-emerald-300"
                  >
                    ✍️ Rewrite Text (Alt Layer)
                  </button>
                  <button
                    onClick={() => {
                      const nextMode = contextPanel.textLayerMode === 'script' ? 'alt' : 'script';
                      updatePanel(switchPanelTextLayerMode(contextPanel, nextMode));
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white/80"
                  >
                    {contextPanel.textLayerMode === 'script' ? '✨ Use Alt' : '📜 Script'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}


        {/* Panel position controls (keyboard-accessible) */}
        {selectedPanel && (
          <div className="shrink-0 border-t border-white/5 bg-black/30 px-4 py-2 flex items-center gap-4 text-xs text-white/40 overflow-x-auto no-scrollbar">
            <span className="text-white/30 font-bold uppercase text-[9px]">Panel Geometry</span>
            {(['x','y','width','height'] as const).map(key => (
              <label key={key} className="flex items-center gap-1.5 shrink-0">
                <span className="uppercase text-[9px] text-white/25">{key}</span>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={Math.round(selectedPanel[key] * 10) / 10}
                  onChange={e => updatePanel({ ...selectedPanel, [key]: Number(e.target.value) })}
                  className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white focus:outline-none text-xs"
                />
                <span className="text-white/20">%</span>
              </label>
            ))}
            <label className="flex items-center gap-1.5 ml-2 shrink-0">
              <span className="text-[9px] text-white/25">BORDER</span>
              <select
                value={selectedPanel.borderStyle ?? 'solid'}
                onChange={e => updatePanel({ ...selectedPanel, borderStyle: e.target.value as any })}
                className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
              >
                {['solid','thick','double','gold','neon','none'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] text-white/25">BG</span>
              <input type="color" value={selectedPanel.bgColor ?? '#111'}
                onChange={e => updatePanel({ ...selectedPanel, bgColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-white/10 bg-transparent" />
            </label>
          </div>
        )}
      </div>

      {/* Right sidebar: bubble editor */}
      <div className="w-[240px] shrink-0 border-l border-white/5 bg-[#0d0d0f] overflow-y-auto p-3">
        {selectedPanel ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
              <div className="text-xs font-black uppercase tracking-wider text-white/70">Panel Layer Editor</div>
              <button onClick={() => { setSelectedPanelId(null); setSelectedBubbleId(null); }} className="text-white/20 hover:text-white">
                <X size={12} />
              </button>
            </div>
            <BubbleSidebar
              panel={selectedPanel}
              selectedBubbleId={selectedBubbleId}
              isHandReframing={handReframePanelId === selectedPanel.id || imagePanMode}
              onToggleHandReframe={() => {
                if (handReframePanelId === selectedPanel.id) {
                  setHandReframePanelId(null);
                  setImagePanMode(false);
                } else {
                  setHandReframePanelId(selectedPanel.id);
                  setImagePanMode(true);
                }
              }}
              onSelectBubble={setSelectedBubbleId}
              onChange={updatePanel}
              onDraw={() => setDrawingPanelId(selectedPanel.id)}
            />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-white/20 p-4">
            <Hand size={24} className="opacity-30 text-amber-400" />
            <p className="text-xs font-bold text-white/40">Select or Double-Click a Panel</p>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Double-click inside any panel to auto-engage the Hand Reframe Tool: freely pan &amp; scale the image, move/scale text bubbles, or rewrite text onto an Alt Layer while preserving the original script version.
            </p>
          </div>
        )}
      </div>

      {/* Script → panels */}
      {showScript && (
        <div className="fixed inset-0 z-[400] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScript(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0b0b0d] border border-white/10">
            <div className="sticky top-0 flex items-center gap-2 px-5 py-4 border-b border-white/8 bg-[#0b0b0d]">
              <Type size={16} className="text-orange-400" />
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Script → panels</p>
              {handoffSource && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">From {handoffSource}</span>}
              <button onClick={() => setShowScript(false)} className="ml-auto text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-white/40 leading-relaxed">Paste a script — use <span className="text-white/70 font-bold">NAME: dialogue</span> for tagged speech, <span className="text-white/70 font-bold">CAPTION:</span> / <span className="text-white/70 font-bold">SFX:</span> lines, and <span className="text-white/70 font-bold">PANEL</span> to start a new panel. It auto-flows into this page's panels in reading order.</p>
              <textarea value={scriptText} onChange={e => setScriptText(e.target.value)} rows={10}
                placeholder={'PANEL 1\nNARRATOR: The city never slept.\nALICE: We need to move — now.\nSFX: BOOM\n\nPANEL 2\nBORIS: Too late for that.'}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500/50 resize-none font-mono" />
              <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>{scriptBeats.length} beats · {panels.length} panels on page</span>
                {scriptCast.length > 0 && <span className="truncate max-w-[60%]">Cast: <span className="text-orange-400/80">{scriptCast.join(', ')}</span></span>}
              </div>
              {handoffChars.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {handoffChars.map(c => (
                    <span key={c.name} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold text-white/60">
                      {c.imageUrl && <img src={c.imageUrl} className="w-4 h-4 rounded-full object-cover" alt="" />}{c.name}
                    </span>
                  ))}
                  <span className="text-[9px] text-white/25 self-center">— world cast; images auto-fill empty panels</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={applyScript} disabled={!scriptBeats.length || !panels.length} className="flex-1 py-3 rounded-full bg-orange-500 text-black font-black text-xs uppercase tracking-widest hover:bg-orange-400 disabled:opacity-40">Flow into panels</button>
                <button onClick={() => setShowScript(false)} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/70 font-black text-xs uppercase tracking-widest">Cancel</button>
              </div>
              {!panels.length && <p className="text-[10px] text-orange-400/70">Pick a layout first so there are panels to flow into.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Story Intelligence On-Device Modal (Gemma 2 2B + Nemotron 4B) */}
      {showStoryIntel && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowStoryIntel(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-[#0d0d11] border border-purple-500/30 shadow-2xl shadow-purple-950/40 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    Story Intelligence
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      RTX 4070 Native GPU
                    </span>
                  </h3>
                  <p className="text-[11px] text-white/40">
                    Dual On-Device AI Engine: Ultra-Fast Deconstruction & Writers Council
                  </p>
                </div>
              </div>
              <button onClick={() => setShowStoryIntel(false)} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Tab Selector & Model Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStoryIntelTab('decompose')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      storyIntelTab === 'decompose'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Beat Deconstruction
                  </button>
                  <button
                    onClick={() => setStoryIntelTab('council')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      storyIntelTab === 'council'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Writers Council Review
                  </button>
                </div>

                {/* Model Selector */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Engine:</span>
                  <button
                    onClick={() => setStoryIntelModel('cascade')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      storyIntelModel === 'cascade'
                        ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300'
                        : 'border-white/10 text-white/40 hover:text-white'
                    }`}
                    title="Speculative Multi-Engine Cascade: Gemma 2 2B speed + Meta Muse Spark & Nemotron continuity"
                  >
                    🔥 Cascade
                  </button>
                  <button
                    onClick={() => setStoryIntelModel('muse-spark')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      storyIntelModel === 'muse-spark'
                        ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300'
                        : 'border-white/10 text-white/40 hover:text-white'
                    }`}
                    title="Meta Muse Spark Open / Glimmer: On-Device Multimodal Contemplating Mode & Visual Reasoning"
                  >
                    ✨ Muse Spark
                  </button>
                  <button
                    onClick={() => setStoryIntelModel('gemma-2-2b')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      storyIntelModel === 'gemma-2-2b'
                        ? 'bg-purple-500/25 border-purple-500 text-purple-300'
                        : 'border-white/10 text-white/40 hover:text-white'
                    }`}
                    title="Google Gemma 2 2B: 120-140 tokens/sec ultra-fast inference"
                  >
                    ⚡ Gemma 2 2B
                  </button>
                  <button
                    onClick={() => setStoryIntelModel('nemotron-4b')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      storyIntelModel === 'nemotron-4b'
                        ? 'bg-purple-500/25 border-purple-500 text-purple-300'
                        : 'border-white/10 text-white/40 hover:text-white'
                    }`}
                    title="NVIDIA Nemotron 4B: Deep dramatic reasoning & continuity"
                  >
                    🧠 Nemotron 4B
                  </button>
                </div>
              </div>

              {/* Prose / Manuscript Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50 flex items-center justify-between">
                  <span>Input Prose, Chapter, or Scene Draft</span>
                  <span className="text-[9px] text-white/30">{storyIntelInput.length} chars</span>
                </label>
                <textarea
                  rows={5}
                  value={storyIntelInput}
                  onChange={e => setStoryIntelInput(e.target.value)}
                  placeholder={'Paste novel prose, screenplay beat, or live transcription here... (e.g., Rain hammered the asphalt as Kael peered through the shattered skylight. "They are already inside," he whispered. BOOM! An optic blast ignited the gloom.)'}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500/60 font-mono resize-none leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {storyIntelTab === 'decompose' ? (
                  <button
                    onClick={handleDeconstructStory}
                    disabled={storyIntelLoading || !storyIntelInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30"
                  >
                    {storyIntelLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Deconstructing with {storyIntelModel === 'cascade' ? 'Multi-Engine Cascade' : storyIntelModel === 'muse-spark' ? 'Meta Muse Spark' : storyIntelModel === 'gemma-2-2b' ? 'Gemma 2 2B' : 'Nemotron 4B'}...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Deconstruct into Sequential Comic Beats
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleRunCouncil}
                    disabled={storyIntelLoading || !storyIntelInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/30"
                  >
                    {storyIntelLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Consulting Writers Council...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Convene Editorial Writers Council
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Results Display */}
              {storyIntelTab === 'decompose' && storyIntelResult && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-purple-300">
                        Discovered: {storyIntelResult.beats.length} Panels · {storyIntelResult.discoveredCharacters.length} Characters
                      </span>
                      {storyIntelResult.latencyMs !== undefined && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {storyIntelResult.inferenceModel || storyIntelModel} · {storyIntelResult.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleApplyIntelToPage}
                        disabled={storyIntelIllustrating}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/15"
                      >
                        Apply Panels Only
                      </button>
                      <button
                        onClick={handleApplyAndIllustrateOnGpu}
                        disabled={storyIntelIllustrating}
                        className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black text-xs transition-all shadow-md flex items-center gap-1.5"
                      >
                        {storyIntelIllustrating ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Rendering on RTX 4070...
                          </>
                        ) : (
                          <>
                            <Sparkles size={12} /> Apply & Illustrate on GPU
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {storyIntelResult.beats.map((b, i) => (
                      <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white/90">Panel {i + 1}</span>
                          <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                            {b.cameraShot}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/70 line-clamp-2">{b.actionSummary}</p>
                        {b.continuityNote && (
                          <div className="text-[9.5px] text-emerald-400/90 bg-emerald-950/30 border border-emerald-500/20 rounded px-2 py-0.5">
                            🔒 {b.continuityNote}
                          </div>
                        )}
                        {b.diffusionPrompt && (
                          <div className="text-[9px] text-white/40 font-mono line-clamp-2 bg-black/30 rounded px-1.5 py-1">
                            🎨 {b.diffusionPrompt}
                          </div>
                        )}
                        {b.suggestedSfx && (
                          <div className="text-[10px] font-black text-orange-400">SFX: {b.suggestedSfx}</div>
                        )}
                        {b.dialogueLines?.map((d, dIdx) => (
                          <div key={dIdx} className="text-[10px] bg-black/40 p-1.5 rounded border border-white/5 text-white/80">
                            <span className="font-bold text-purple-400">{d.speaker}: </span>
                            <span>"{d.text}"</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Council Results Display */}
              {storyIntelTab === 'council' && storyCouncilResult && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-purple-300">Writers Council Overall Score</div>
                      <div className="text-[11px] text-white/60">{storyCouncilResult.executiveSummary}</div>
                    </div>
                    <div className="text-2xl font-black text-purple-400">{storyCouncilResult.overallScore}/100</div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {storyCouncilResult.councilMembers?.map((m, mIdx) => (
                      <div key={mIdx} className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white/90">{m.role}</span>
                          <span className="text-emerald-400 font-mono font-bold">{m.score}/100</span>
                        </div>
                        <p className="text-[11px] text-white/60">{m.critique}</p>
                        {m.actionableRecommendations?.map((rec, rIdx) => (
                          <div key={rIdx} className="text-[10px] text-purple-300/80 pl-2 border-l border-purple-500/40">
                            • {rec}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawing canvas */}
      {drawingPanel && (
        <ComicDrawCanvas
          width={Math.max(600, Math.round((drawingPanel.width / 100) * CANVAS_W * 2))}
          height={Math.max(600, Math.round((drawingPanel.height / 100) * CANVAS_H * 2))}
          initialImageUrl={drawingPanel.imageUrl}
          onSave={saveDrawing}
          onClose={() => setDrawingPanelId(null)}
        />
      )}
    </div>
  );
}
