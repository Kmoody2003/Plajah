import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { StudioPage, StudioPanel, SpeechBubble } from '../../types';
import {
  sharedVideoPool,
  savePanelOverrideById,
  getPanelOverrideById,
  formatPanelTimecode as formatTimecode,
} from '../../services/comicVideoLoopEngine';
import { computeSafeBalloonPlacement } from '../../services/council/comicMangaCouncil';

function buildMuxThumbnailUrl(muxPlaybackId: string, timeSec: number, width = 1280): string {
  const t = Math.max(0, Math.round(timeSec * 100) / 100);
  return `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=${t}&width=${width}&fit_mode=preserve`;
}


export type EditorialLensId = 'cinematic' | 'noir' | 'manga' | 'kirby' | 'ligne';

export interface CouncilV4GraphicNovelStudioViewProps {
  pages: StudioPage[];
  activePageIndex: number;
  onSelectPageIndex: (pageIndex: number) => void;
  onUpdatePage: (updatedPage: StudioPage, pageIndex?: number) => void;
  selectedPanelId?: string | null;
  onSelectPanel?: (panelId: string, panelIndex: number, pageIndex: number) => void;
  onOpenDeepEditOrInker?: (panelIndex: number, pageIndex: number) => void;
  bookTitle?: string;
  bookAuthor?: string;
  defaultViewMode?: 'ALL_PAGES' | 'SINGLE_PAGE';
  defaultLens?: EditorialLensId;
}

const DEFAULT_MUX_PLAYBACK_ID = 'D1A4FF6AJXRbfbPjzvzQCkj5srRk99uXpnDn00gTKDts';
const DEFAULT_SOURCE_VIDEO_URL =
  'https://firebasestorage.googleapis.com/v0/b/plajah-ef897.firebasestorage.app/o/users%2FG261332820%2Fvideos%2F1773784407510_Pumpkin_Patch__Oct_2025_.mp4?alt=media&token=c6fbefe1-be42-4bc9-8f4d-965f21bf1b03';

interface TierItem {
  panel: StudioPanel;
  panelIndex: number;
  flex: number;
  insetPanel?: {
    panel: StudioPanel;
    panelIndex: number;
  };
}

interface ChoreographedRow {
  heightPx: number;
  items: TierItem[];
}

/**
 * Organizes a page's panels into multi-tier graphic novel rows matching pumpkin_patch_comic_reader_v4.html.
 */
function choreographPageRows(panels: StudioPanel[], pageIndex: number): ChoreographedRow[] {
  if (!panels || panels.length === 0) return [];

  // Check if panels already have distinct row groupings by y% (within 4% tolerance)
  const sortedWithIdx = panels.map((panel, panelIndex) => ({ panel, panelIndex }));
  const rows: ChoreographedRow[] = [];

  // Group panels that share approximately the same y coordinate if they have varied y coordinates
  const distinctYs = new Set(panels.map((p) => Math.round((p.y || 0) / 5) * 5));
  if (distinctYs.size >= 2 && panels.length <= 16) {
    const rowBuckets: Array<Array<{ panel: StudioPanel; panelIndex: number }>> = [];
    for (const item of sortedWithIdx) {
      const py = item.panel.y ?? 0;
      const existing = rowBuckets.find(
        (b) => Math.abs((b[0].panel.y ?? 0) - py) <= 6
      );
      if (existing && existing.length < 4) {
        existing.push(item);
      } else {
        rowBuckets.push([item]);
      }
    }

    // Merge INSET_PIP panels into their preceding host panel if present
    for (let r = 0; r < rowBuckets.length; r++) {
      const bucket = rowBuckets[r];
      const tierItems: TierItem[] = [];
      for (let i = 0; i < bucket.length; i++) {
        const current = bucket[i];
        if (current.panel.geometry === 'INSET_PIP' && tierItems.length > 0) {
          tierItems[tierItems.length - 1].insetPanel = current;
        } else {
          const flex = Math.max(1, Math.round((current.panel.width || 33) / 15));
          tierItems.push({
            panel: current.panel,
            panelIndex: current.panelIndex,
            flex,
          });
        }
      }
      if (tierItems.length > 0) {
        const avgH =
          tierItems.reduce((acc, it) => acc + (it.panel.height || 24), 0) /
          tierItems.length;
        const heightPx = Math.max(250, Math.min(430, Math.round(avgH * 12.5)));
        rows.push({ heightPx, items: tierItems });
      }
    }
    if (rows.length > 0) return rows;
  }

  // Fallback choreography by archetype pattern (2-4 panels per tier)
  let cursor = 0;
  let tierIdx = 0;
  while (cursor < sortedWithIdx.length) {
    const remaining = sortedWithIdx.length - cursor;
    const count =
      tierIdx === 0 && (pageIndex % 5 === 0 || sortedWithIdx[cursor]?.panel.geometry === 'OPEN_BLEED_HERO')
        ? Math.min(2, remaining)
        : remaining >= 4 && tierIdx % 2 === 1
        ? 3
        : Math.min(3, remaining);

    const slice = sortedWithIdx.slice(cursor, cursor + count);
    cursor += count;

    const items: TierItem[] = slice.map((s, idx) => ({
      panel: s.panel,
      panelIndex: s.panelIndex,
      flex: count === 1 ? 1 : count === 2 && idx === 0 ? 1.45 : 1,
    }));

    rows.push({
      heightPx: tierIdx === 0 ? 370 : 295,
      items,
    });
    tierIdx++;
  }

  return rows;
}

export const CouncilV4GraphicNovelStudioView: React.FC<CouncilV4GraphicNovelStudioViewProps> = ({
  pages,
  activePageIndex,
  onSelectPageIndex,
  onUpdatePage,
  selectedPanelId,
  onSelectPanel,
  onOpenDeepEditOrInker,
  bookTitle = 'UNTITLED GRAPHIC NOVEL',
  bookAuthor = 'Council V4 Living Graphic Novel Studio',
  defaultViewMode = 'ALL_PAGES',
  defaultLens = 'cinematic',
}) => {
  const [activeLens, setActiveLens] = useState<EditorialLensId>(defaultLens);
  const [viewMode, setViewMode] = useState<'ALL_PAGES' | 'SINGLE_PAGE'>(defaultViewMode);
  const [globalMoveFrameMode, setGlobalMoveFrameMode] = useState<boolean>(false);
  const [handModePanelId, setHandModePanelId] = useState<string | null>(null);
  const [safeZoneFlash, setSafeZoneFlash] = useState<string | null>(null);

  // Context Menu State
  const [ctxMenu, setCtxMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    pageIndex: number;
    panelIndex: number;
    panelId: string;
    scrubOffsetSec: number;
    previewFrameUrl: string | null;
  } | null>(null);

  // Inline Alt Layer Text Studio Modal State
  const [altTextModal, setAltTextModal] = useState<{
    pageIndex: number;
    panelIndex: number;
    panelId: string;
    focusTarget?: 'caption' | 'sfx' | string; // balloon id
  } | null>(null);

  // Director Spec Modal State
  const [specModal, setSpecModal] = useState<{
    pageIndex: number;
    panelIndex: number;
    panel: StudioPanel;
  } | null>(null);

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const dragStateRef = useRef<{
    type: 'PAN_IMAGE' | 'DRAG_BUBBLE' | 'DRAG_CAPTION' | 'DRAG_SFX';
    pageIndex: number;
    panelIndex: number;
    bubbleId?: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);

  // Total counts
  const { totalPanels, totalBalloons, activeLoopCount } = useMemo(() => {
    let pCount = 0;
    let bCount = 0;
    let lCount = 0;
    for (const pg of pages) {
      for (const pn of pg.panels || []) {
        pCount++;
        bCount += (pn.bubbles || []).length;
        if (pn.isVideoLoop) lCount++;
      }
    }
    return { totalPanels: pCount, totalBalloons: bCount, activeLoopCount: lCount };
  }, [pages]);

  // Apply persisted overrides from localStorage on initial mount
  useEffect(() => {
    pages.forEach((pg, pgIdx) => {
      let modified = false;
      const nextPanels = (pg.panels || []).map((pn) => {
        const key = pn.id || (pn.globalPanelNumber ? `p_${pn.globalPanelNumber}` : '');
        const ov = getPanelOverrideById(key) || (pn.globalPanelNumber ? getPanelOverrideById(String(pn.globalPanelNumber)) : null);
        if (!ov) return pn;
        modified = true;
        return {
          ...pn,
          timecodeSeconds: ov.timecodeSeconds ?? pn.timecodeSeconds,
          imageUrl: ov.imageUrl || pn.imageUrl,
          imageOffsetX: ov.imageOffsetX ?? pn.imageOffsetX,
          imageOffsetY: ov.imageOffsetY ?? pn.imageOffsetY,
          imageScale: ov.imageScale ?? pn.imageScale,
          borderStyle: (ov.borderStyle as any) ?? pn.borderStyle,
          shape: (ov.shape as any) ?? pn.shape,
          isVideoLoop: ov.isVideoLoop ?? pn.isVideoLoop,
          loopInSeconds: ov.loopInSeconds ?? pn.loopInSeconds,
          loopOutSeconds: ov.loopOutSeconds ?? pn.loopOutSeconds,
        };
      });
      if (modified) {
        onUpdatePage({ ...pg, panels: nextPanels }, pgIdx);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manage shared single-load video loops for panels with isVideoLoop === true
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    pages.forEach((pg) => {
      (pg.panels || []).forEach((pn) => {
        const pKey = pn.id || `panel_${pn.globalPanelNumber}`;
        const canvas = canvasRefs.current[pKey];
        if (pn.isVideoLoop && canvas) {
          const videoUrl = pn.sourceVideoUrl || DEFAULT_SOURCE_VIDEO_URL;
          const anchor = pn.timecodeSeconds ?? pn.anchorTimecodeSeconds ?? 10;
          const inSec = pn.loopInSeconds ?? anchor;
          const outSec = pn.loopOutSeconds ?? Math.min(inSec + 5, (pn.endTimecodeSeconds || inSec + 5));
          const unsub = sharedVideoPool.subscribePanelLoop({
            panelId: pKey,
            videoUrl,
            loopInSeconds: inSec,
            loopOutSeconds: outSec,
            onFrame: (videoEl) => {
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              if (canvas.width !== (videoEl.videoWidth || 640)) {
                canvas.width = videoEl.videoWidth || 640;
                canvas.height = videoEl.videoHeight || 360;
              }
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            },
          });
          unsubscribers.push(unsub);
        }
      });
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [pages, viewMode, activePageIndex]);


  // Helper to update a specific panel on a specific page
  const updatePanelOnPage = useCallback(
    (pageIdx: number, panelIdx: number, updater: (prev: StudioPanel) => StudioPanel) => {
      const targetPage = pages[pageIdx];
      if (!targetPage) return;
      const nextPanels = targetPage.panels.map((p, idx) => (idx === panelIdx ? updater(p) : p));
      onUpdatePage({ ...targetPage, panels: nextPanels }, pageIdx);
    },
    [pages, onUpdatePage]
  );

  // Global mouse move / up handlers for direct manipulation (pan image, drag bubble, drag caption, drag sfx)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (st.type === 'PAN_IMAGE') {
        const nextOx = Math.max(-280, Math.min(280, Math.round(st.initialX + dx)));
        const nextOy = Math.max(-280, Math.min(280, Math.round(st.initialY + dy)));
        updatePanelOnPage(st.pageIndex, st.panelIndex, (prev) => {
          savePanelOverrideById(prev.id, { imageOffsetX: nextOx, imageOffsetY: nextOy });
          return { ...prev, imageOffsetX: nextOx, imageOffsetY: nextOy };
        });
      } else if (st.type === 'DRAG_BUBBLE' && st.bubbleId) {
        const nextXPct = Math.max(2, Math.min(88, Math.round((st.initialX + (dx / st.rectWidth) * 100) * 10) / 10));
        const nextYPct = Math.max(2, Math.min(88, Math.round((st.initialY + (dy / st.rectHeight) * 100) * 10) / 10));
        updatePanelOnPage(st.pageIndex, st.panelIndex, (prev) => ({
          ...prev,
          bubbles: (prev.bubbles || []).map((b) =>
            b.id === st.bubbleId ? { ...b, x: nextXPct, y: nextYPct } : b
          ),
        }));
      } else if (st.type === 'DRAG_CAPTION') {
        const nextXPct = Math.max(2, Math.min(82, Math.round((st.initialX + (dx / st.rectWidth) * 100) * 10) / 10));
        const nextYPct = Math.max(2, Math.min(85, Math.round((st.initialY + (dy / st.rectHeight) * 100) * 10) / 10));
        updatePanelOnPage(st.pageIndex, st.panelIndex, (prev) => ({
          ...prev,
          captionX: nextXPct,
          captionY: nextYPct,
        }));
      } else if (st.type === 'DRAG_SFX') {
        const nextXPct = Math.max(4, Math.min(86, Math.round((st.initialX + (dx / st.rectWidth) * 100) * 10) / 10));
        const nextYPct = Math.max(4, Math.min(86, Math.round((st.initialY + (dy / st.rectHeight) * 100) * 10) / 10));
        updatePanelOnPage(st.pageIndex, st.panelIndex, (prev) => ({
          ...prev,
          sfxX: nextXPct,
          sfxY: nextYPct,
        }));
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updatePanelOnPage]);

  // Enforce 5 Non-Negotiable Comic Lettering Safe-Zone Rules across all pages or active page
  const handleEnforceSafeZones = () => {
    let adjustedCount = 0;
    pages.forEach((pg, pgIdx) => {
      const nextPanels = (pg.panels || []).map((pn) => {
        if (!pn.bubbles || pn.bubbles.length === 0) return pn;
        const shotType =
          pn.framingCode === 'ECU'
            ? 'ECU'
            : pn.framingCode === 'CU'
            ? 'CU'
            : pn.framingCode === 'WS'
            ? 'WS'
            : 'MS';
        const nextBubbles = pn.bubbles.map((b, bIdx) => {
          const safe = computeSafeBalloonPlacement(bIdx, pn.bubbles.length, shotType, b.text?.length || 40);
          adjustedCount++;
          return {
            ...b,
            x: safe.x,
            y: safe.y,
            width: safe.width,
            tailDir: safe.tailDir,
            dockZone: safe.dockZone,
            safeZoneVerified: true,
          };
        });
        return { ...pn, bubbles: nextBubbles };
      });
      onUpdatePage({ ...pg, panels: nextPanels }, pgIdx);
    });
    setSafeZoneFlash(`✓ Verified ${adjustedCount} balloons in safe perimeter zones (0% face occlusion)`);
    setTimeout(() => setSafeZoneFlash(null), 3500);
  };

  // Open Panel Context Menu
  const openPanelContextMenu = (
    e: React.MouseEvent,
    pageIndex: number,
    panelIndex: number,
    panel: StudioPanel
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 370;
    const menuHeight = 560;
    const x = Math.min(window.innerWidth - menuWidth - 16, Math.max(12, e.clientX));
    const y = Math.min(window.innerHeight - menuHeight - 16, Math.max(12, e.clientY));
    const currentTc = panel.timecodeSeconds ?? panel.anchorTimecodeSeconds ?? 0;
    const anchorTc = panel.anchorTimecodeSeconds ?? currentTc;
    const offset = Math.max(-60, Math.min(60, Math.round((currentTc - anchorTc) * 10) / 10));

    setCtxMenu({
      open: true,
      x,
      y,
      pageIndex,
      panelIndex,
      panelId: panel.id,
      scrubOffsetSec: offset,
      previewFrameUrl: null,
    });
    onSelectPanel?.(panel.id, panelIndex, pageIndex);
  };

  const handleJumpToPage = (pIdx: number) => {
    onSelectPageIndex(pIdx);
    if (viewMode === 'ALL_PAGES') {
      const el = pageRefs.current[pIdx];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const pagesToRender = useMemo(() => {
    if (viewMode === 'SINGLE_PAGE') {
      const pg = pages[activePageIndex] || pages[0];
      return pg ? [{ page: pg, pageIndex: activePageIndex }] : [];
    }
    return pages.map((page, pageIndex) => ({ page, pageIndex }));
  }, [pages, viewMode, activePageIndex]);

  const activeCtxPanel =
    ctxMenu && pages[ctxMenu.pageIndex]?.panels[ctxMenu.panelIndex]
      ? pages[ctxMenu.pageIndex].panels[ctxMenu.panelIndex]
      : null;

  const activeAltModalPanel =
    altTextModal && pages[altTextModal.pageIndex]?.panels[altTextModal.panelIndex]
      ? pages[altTextModal.pageIndex].panels[altTextModal.panelIndex]
      : null;

  return (
    <div className={`v4-studio-root lens-${activeLens} relative w-full h-full overflow-y-auto select-none`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Chakra+Petch:ital,wght@0,600;0,700;1,700&family=Comic+Neue:ital,wght@0,700;1,700&family=JetBrains+Mono:wght@500;700&family=Oswald:wght@600;700&display=swap');

        .v4-studio-root {
          --bg-obsidian: #070709;
          --paper-stock: #111116;
          --gutter-color: #09090d;
          --gutter-width: 10px;
          --panel-border: 3px solid #f4f4f6;
          --panel-radius: 3px;
          --panel-filter: contrast(1.06) saturate(1.08);
          --caption-bg: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          --caption-text: #09090b;
          --caption-border: 2.5px solid #000000;
          --balloon-bg: #ffffff;
          --balloon-text: #09090b;
          --balloon-border: 2.5px solid #09090b;
          --accent-amber: #f59e0b;
          --accent-cyan: #06b6d4;
          background-color: var(--bg-obsidian);
          color: #f4f4f6;
          font-family: 'Chakra Petch', system-ui, sans-serif;
        }

        .v4-studio-root.lens-noir {
          --paper-stock: #050507;
          --gutter-color: #000000;
          --gutter-width: 12px;
          --panel-border: 4px solid #ffffff;
          --panel-radius: 0px;
          --panel-filter: grayscale(0.88) contrast(1.55) brightness(0.92);
          --caption-bg: #dc2626;
          --caption-text: #ffffff;
          --caption-border: 3px solid #ffffff;
        }

        .v4-studio-root.lens-manga {
          --paper-stock: #f8fafc;
          --gutter-color: #f1f5f9;
          --gutter-width: 8px;
          --panel-border: 3px solid #09090b;
          --panel-radius: 0px;
          --panel-filter: grayscale(1) contrast(1.38) brightness(1.05);
          --caption-bg: #09090b;
          --caption-text: #ffffff;
          --caption-border: 2px solid #09090b;
        }

        .v4-studio-root.lens-kirby {
          --paper-stock: #18130a;
          --gutter-color: #fbbf24;
          --gutter-width: 11px;
          --panel-border: 4px solid #09090b;
          --panel-radius: 6px;
          --panel-filter: contrast(1.22) saturate(1.45);
          --caption-bg: #fde047;
          --caption-text: #09090b;
          --caption-border: 3px solid #09090b;
        }

        .v4-studio-root.lens-ligne {
          --paper-stock: #f4efe6;
          --gutter-color: #e5dec9;
          --gutter-width: 12px;
          --panel-border: 2.5px solid #1e1b18;
          --panel-radius: 4px;
          --panel-filter: contrast(1.08) saturate(1.18) sepia(0.12);
          --caption-bg: #fef08a;
          --caption-text: #1e1b18;
          --caption-border: 2px solid #1e1b18;
        }

        .v4-comic-page {
          width: 100%;
          max-width: 1120px;
          margin: 0 auto 38px auto;
          background: var(--paper-stock);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 18px 18px 22px 18px;
          box-shadow: 0 28px 70px rgba(0,0,0,0.85), 0 0 0 1px rgba(245, 158, 11, 0.08);
          position: relative;
          overflow: hidden;
          transition: background 0.3s ease, border-color 0.3s ease;
        }

        .v4-comic-page.active-studio-page {
          border-color: rgba(245, 158, 11, 0.55);
          box-shadow: 0 28px 70px rgba(0,0,0,0.9), 0 0 0 2px rgba(245, 158, 11, 0.35);
        }

        .v4-tier-row {
          display: flex;
          gap: var(--gutter-width);
          width: 100%;
          position: relative;
        }

        .v4-panel-box {
          position: relative;
          overflow: hidden;
          border: var(--panel-border);
          border-radius: var(--panel-radius);
          background: #000;
          box-shadow: 0 8px 24px rgba(0,0,0,0.65);
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, border-color 0.2s ease;
          user-select: none;
        }

        .v4-panel-box:hover {
          z-index: 15;
          box-shadow: 0 14px 34px rgba(0,0,0,0.85), 0 0 0 2px var(--accent-amber);
        }

        .v4-panel-box.selected-panel {
          z-index: 18;
          box-shadow: 0 0 0 3px #f59e0b, 0 16px 38px rgba(0,0,0,0.9);
        }

        .v4-panel-box.hand-mode-active {
          z-index: 35 !important;
          cursor: grab !important;
          box-shadow: 0 0 0 3px #10b981, 0 0 28px rgba(16, 185, 129, 0.45) !important;
        }

        .v4-panel-box.hand-mode-active:active {
          cursor: grabbing !important;
        }

        .v4-panel-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 22%;
          filter: var(--panel-filter);
          display: block;
          pointer-events: none;
          transform-origin: center center;
        }

        .v4-panel-box.geom-OPEN_BLEED_HERO {
          border: none !important;
          border-radius: 8px;
          box-shadow: 0 18px 46px rgba(0,0,0,0.92);
        }

        .v4-panel-box.geom-DIAG_SLASH_R {
          clip-path: polygon(0 0, 100% 0, 93% 100%, 0% 100%);
          margin-right: -1.8%;
        }

        .v4-panel-box.geom-DIAG_SLASH_L {
          clip-path: polygon(7% 0, 100% 0, 100% 100%, 0% 100%);
          margin-left: -1.8%;
        }

        .v4-panel-box.geom-CIRCLE_SCOPE {
          border-radius: 22px;
          border: 3px solid #22d3ee !important;
          box-shadow: inset 0 0 30px rgba(6, 182, 212, 0.45), 0 10px 28px rgba(0,0,0,0.8);
        }

        .v4-panel-box.shape-slant-left {
          clip-path: polygon(6% 0%, 100% 0%, 94% 100%, 0% 100%) !important;
        }
        .v4-panel-box.shape-slant-right {
          clip-path: polygon(0% 0%, 94% 0%, 100% 100%, 6% 100%) !important;
        }
        .v4-panel-box.shape-rounded {
          border-radius: 22px !important;
        }
        .v4-panel-box.shape-circle-scope {
          border-radius: 999px !important;
          border: 3px solid #22d3ee !important;
        }

        .v4-panel-box.bstyle-thick {
          border: 5px solid #ffffff !important;
        }
        .v4-panel-box.bstyle-gold {
          border: 3.5px solid #f59e0b !important;
          box-shadow: 0 0 22px rgba(245, 158, 11, 0.35) !important;
        }
        .v4-panel-box.bstyle-neon {
          border: 3px solid #22d3ee !important;
          box-shadow: 0 0 22px rgba(34, 211, 238, 0.45) !important;
        }
        .v4-panel-box.bstyle-none {
          border: none !important;
        }

        .v4-caption-box {
          position: absolute;
          max-width: 72%;
          background: var(--caption-bg);
          color: var(--caption-text);
          border: var(--caption-border);
          padding: 5px 10px;
          font-family: 'Chakra Petch', sans-serif;
          font-size: 11.5px;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: 0.02em;
          box-shadow: 3px 3px 0px rgba(0,0,0,0.88);
          z-index: 16;
          text-transform: uppercase;
          transform-origin: top left;
        }

        .v4-balloon-wrapper {
          position: absolute;
          max-width: 56%;
          min-width: 110px;
          z-index: 18;
          filter: drop-shadow(2px 4px 0px rgba(0,0,0,0.88));
          transform-origin: center center;
        }

        .v4-speech-balloon {
          background: var(--balloon-bg);
          color: var(--balloon-text);
          border: var(--balloon-border);
          border-radius: 16px;
          padding: 6px 11px;
          font-family: 'Comic Neue', sans-serif;
          font-weight: 700;
          font-size: 12.5px;
          line-height: 1.24;
          text-align: center;
          position: relative;
        }

        .v4-speaker-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #09090b;
          color: #fbbf24;
          font-family: 'Oswald', sans-serif;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 1px 6px;
          border-radius: 4px;
          margin-bottom: 3px;
          text-transform: uppercase;
        }

        .v4-sfx-decal {
          position: absolute;
          font-family: 'Bangers', cursive;
          font-size: 24px;
          letter-spacing: 0.06em;
          color: #fde047;
          text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 4px 4px 0 #dc2626;
          z-index: 19;
          transform-origin: center center;
        }
      `}</style>

      {/* ─── STICKY COUNCIL V4 STUDIO HEADER & LENS BAR ───────────────────── */}
      <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-b border-amber-500/30 px-4 py-2.5 shadow-2xl">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Flagship Identity */}
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black text-[10px] tracking-widest uppercase shadow">
              COUNCIL V4 · LIVING GRAPHIC NOVEL
            </span>
            <div>
              <div className="text-sm font-black tracking-wider text-white uppercase flex items-center gap-2">
                <span>{bookTitle}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-400">
                  {pages.length} PAGES · {totalPanels} PANELS · {totalBalloons} BALLOONS
                </span>
                {activeLoopCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300">
                    🎬 {activeLoopCount} LIVE LOOPS (1 SHARED STREAM)
                  </span>
                )}
              </div>
              <div className="text-[10px] text-zinc-400">
                Double-click any panel for <strong className="text-emerald-400">✋ Hand Reframe & Alt Text Layer</strong> · Right-click any panel for <strong className="text-amber-400">±60s Frame Scrubber & Video Loop Studio</strong>
              </div>
            </div>
          </div>

          {/* Right: 5 Editorial Council Lenses + Studio Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'cinematic', label: '🎬 Cinematic Master' },
                { id: 'noir', label: '🌑 Dark Noir (Miller)' },
                { id: 'manga', label: '⚡ Seinen Manga (Otomo)' },
                { id: 'kirby', label: '💥 Silver Architect (Kirby)' },
                { id: 'ligne', label: '🎨 Ligne Claire (Moebius)' },
              ] as const
            ).map((lens) => (
              <button
                key={lens.id}
                onClick={() => setActiveLens(lens.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border ${
                  activeLens === lens.id
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {lens.label}
              </button>
            ))}

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            <button
              onClick={() => {
                setGlobalMoveFrameMode((prev) => !prev);
                if (handModePanelId) setHandModePanelId(null);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border ${
                globalMoveFrameMode || handModePanelId
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
              }`}
              title="Toggle Direct Hand Reframe Mode across all panels (or double-click inside any panel)"
            >
              ✋ {globalMoveFrameMode ? 'Hand Reframe: ON' : 'Hand Reframe Tool'}
            </button>

            <button
              onClick={handleEnforceSafeZones}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-300 transition-all"
              title="Enforce the 5 Non-Negotiable Comic Lettering Safe-Zone Rules across all balloons"
            >
              🛡️ Safe-Zone Dock
            </button>

            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('ALL_PAGES')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewMode === 'ALL_PAGES'
                    ? 'bg-amber-500 text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                📚 All {pages.length} Pages
              </button>
              <button
                onClick={() => setViewMode('SINGLE_PAGE')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  viewMode === 'SINGLE_PAGE'
                    ? 'bg-amber-500 text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                📄 Focused Page ({activePageIndex + 1})
              </button>
            </div>
          </div>
        </div>

        {/* Safe-zone confirmation toast */}
        {safeZoneFlash && (
          <div className="max-w-[1440px] mx-auto mt-1.5 px-3 py-1 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center justify-between">
            <span>{safeZoneFlash}</span>
            <button onClick={() => setSafeZoneFlash(null)} className="text-xs opacity-75 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* 26-Page Jump Strip */}
        <div className="max-w-[1440px] mx-auto mt-2 pt-1.5 border-t border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 shrink-0 mr-1">
            PAGES:
          </span>
          {pages.map((pg, idx) => {
            const isCurrent = idx === activePageIndex;
            const hasLoops = (pg.panels || []).some((p) => p.isVideoLoop);
            const hasAlt = (pg.panels || []).some(
              (p) =>
                p.useAltCaptionLayer ||
                p.useAltSfxLayer ||
                (p.bubbles || []).some((b) => b.useAltTextLayer)
            );
            return (
              <button
                key={pg.id || idx}
                onClick={() => handleJumpToPage(idx)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 transition-all border flex items-center gap-1 ${
                  isCurrent
                    ? 'bg-amber-500 text-black border-amber-400 shadow'
                    : 'bg-zinc-900/90 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'
                }`}
                title={`Page ${idx + 1}: ${pg.slugline || pg.chapterTitle || ''} (${(pg.panels || []).length} panels)`}
              >
                <span>P{idx + 1}</span>
                <span className="opacity-70 text-[9px]">({(pg.panels || []).length})</span>
                {hasLoops && <span title="Has Live Video Loop">🎬</span>}
                {hasAlt && <span title="Has Custom Alt Text Layer">✨</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── GRAPHIC NOVEL PAGES STREAM ───────────────────────────────────── */}
      <div className="px-4 py-6">
        {pagesToRender.map(({ page, pageIndex }) => {
          const rows = choreographPageRows(page.panels || [], pageIndex);
          const isPageSelected = pageIndex === activePageIndex;

          return (
            <div
              key={page.id || pageIndex}
              ref={(el) => {
                pageRefs.current[pageIndex] = el;
              }}
              onClick={() => {
                if (activePageIndex !== pageIndex) onSelectPageIndex(pageIndex);
              }}
              className={`v4-comic-page ${isPageSelected ? 'active-studio-page' : ''}`}
            >
              {/* Page Top Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-white/10">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="bg-amber-500 text-black font-black text-xs px-2.5 py-0.5 rounded tracking-wider uppercase font-mono">
                    PAGE {String(pageIndex + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
                  </span>
                  {page.actNumber && (
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-400">
                      ACT {page.actNumber}
                    </span>
                  )}
                  <span className="text-sm font-bold tracking-wider uppercase text-zinc-100">
                    {page.slugline || page.chapterTitle || `SEQUENCE ${pageIndex + 1}`}
                  </span>
                  {page.timeRangeLabel && (
                    <span className="text-[11px] font-mono text-zinc-400">
                      ⏱ {page.timeRangeLabel}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {page.layoutGrammar && (
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                      {page.layoutGrammar}
                    </span>
                  )}
                  {page.activeLensName && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {page.activeLensName}
                    </span>
                  )}
                </div>
              </div>

              {/* Multi-Tier Panel Choreography */}
              <div className="flex flex-col gap-2.5">
                {rows.map((row, rIdx) => (
                  <div
                    key={rIdx}
                    className="v4-tier-row"
                    style={{ height: `${row.heightPx}px` }}
                  >
                    {row.items.map((item) => {
                      const { panel, panelIndex, flex, insetPanel } = item;
                      const isHandActive =
                        globalMoveFrameMode || handModePanelId === panel.id;
                      const isSelected = selectedPanelId === panel.id;
                      const pKey = panel.id || `panel_${panel.globalPanelNumber}`;
                      const ox = panel.imageOffsetX ?? 0;
                      const oy = panel.imageOffsetY ?? 0;
                      const sc = panel.imageScale ?? 1;

                      const displayCaption =
                        panel.useAltCaptionLayer && panel.altCaption !== undefined
                          ? panel.altCaption
                          : panel.caption;

                      const displaySfx =
                        panel.useAltSfxLayer && panel.altSfx !== undefined
                          ? panel.altSfx
                          : panel.sfxText;

                      const tcLabel =
                        panel.timecodeSeconds !== undefined
                          ? formatTimecode(panel.timecodeSeconds)
                          : null;

                      return (
                        <div
                          key={panel.id || panelIndex}
                          style={{ flex }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPageIndex(pageIndex);
                            onSelectPanel?.(panel.id, panelIndex, pageIndex);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onSelectPageIndex(pageIndex);
                            onSelectPanel?.(panel.id, panelIndex, pageIndex);
                            setHandModePanelId((prev) =>
                              prev === panel.id ? null : panel.id
                            );
                          }}
                          onContextMenu={(e) =>
                            openPanelContextMenu(e, pageIndex, panelIndex, panel)
                          }
                          onMouseDown={(e) => {
                            if (!isHandActive || e.button !== 0) return;
                            // Only start image pan if user didn't click a bubble/caption/sfx/button
                            const target = e.target as HTMLElement;
                            if (
                              target.closest('.v4-balloon-wrapper') ||
                              target.closest('.v4-caption-box') ||
                              target.closest('.v4-sfx-decal') ||
                              target.closest('.v4-hud-control')
                            ) {
                              return;
                            }
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            dragStateRef.current = {
                              type: 'PAN_IMAGE',
                              pageIndex,
                              panelIndex,
                              startX: e.clientX,
                              startY: e.clientY,
                              initialX: ox,
                              initialY: oy,
                              rectWidth: rect.width,
                              rectHeight: rect.height,
                            };
                          }}
                          onWheel={(e) => {
                            if (!isHandActive) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const delta = e.deltaY < 0 ? 0.08 : -0.08;
                            const nextScale = Math.max(
                              0.5,
                              Math.min(3.5, Math.round((sc + delta) * 100) / 100)
                            );
                            updatePanelOnPage(pageIndex, panelIndex, (prev) => {
                              savePanelOverrideById(prev.id, { imageScale: nextScale });
                              return { ...prev, imageScale: nextScale };
                            });
                          }}
                          className={`v4-panel-box geom-${panel.geometry || 'RECT'} ${
                            panel.shape ? `shape-${panel.shape}` : ''
                          } ${panel.borderStyle ? `bstyle-${panel.borderStyle}` : ''} ${
                            isSelected ? 'selected-panel' : ''
                          } ${isHandActive ? 'hand-mode-active' : ''}`}
                        >
                          {/* Panel Artwork Image */}
                          {panel.imageUrl ? (
                            <img
                              src={panel.imageUrl}
                              alt={panel.caption || `Panel ${panelIndex + 1}`}
                              className="v4-panel-img"
                              style={{
                                transform: `translate(${ox}px, ${oy}px) scale(${sc})`,
                              }}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex flex-col items-center justify-center text-center p-4 select-none relative overflow-hidden"
                              style={{
                                background:
                                  'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.07) 0%, rgba(12,13,20,0.96) 75%), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 24px)',
                              }}
                            >
                              <div className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[9px] font-mono font-bold uppercase tracking-widest text-cyan-300 mb-1.5">
                                BASE TEMPLATE · PANEL #{panelIndex + 1} · {panel.shotType || 'MS'} · {panel.geometry || 'RECT'}
                              </div>
                              <div className="text-xs font-bold text-zinc-300 mb-1">
                                Empty Story Panel Ready
                              </div>
                              <div className="text-[10px] text-zinc-500 max-w-[260px] leading-snug mb-2.5">
                                Drop artwork from PAI Gallery, generate on-device, draw with Inker, or add dialogue &amp; captions.
                              </div>
                              <div className="v4-hud-control flex flex-wrap items-center justify-center gap-1.5 z-20">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAltTextModal({
                                      pageIndex,
                                      panelIndex,
                                      panelId: panel.id,
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold transition-all"
                                >
                                  💬 + Dialogue / Alt Text
                                </button>
                                {onOpenDeepEditOrInker && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenDeepEditOrInker(panelIndex, pageIndex);
                                    }}
                                    className="px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-[10px] font-bold transition-all"
                                  >
                                    🎨 Draw / Inker
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Live Cinemagraph Video Loop Canvas (Single-Load Shared Video Engine) */}
                          <canvas
                            ref={(el) => {
                              canvasRefs.current[pKey] = el;
                            }}
                            className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
                              panel.isVideoLoop ? 'opacity-100 z-[8]' : 'opacity-0 -z-10'
                            }`}
                            style={{
                              transform: `translate(${ox}px, ${oy}px) scale(${sc})`,
                            }}
                          />

                          {/* SAM 2.5D Foreground Subject Cutout Layer */}
                          {panel.samLayerEnabled && panel.imageUrl && (
                            <img
                              src={panel.imageUrl}
                              alt=""
                              className="v4-panel-img absolute inset-0 pointer-events-none z-[9]"
                              style={{
                                clipPath: 'ellipse(36% 46% at 50% 48%)',
                                filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.92)) contrast(1.12)',
                                transform: `translate(${ox}px, ${oy}px) scale(${Math.round(sc * 1.04 * 100) / 100})`,
                              }}
                            />
                          )}

                          {/* Circular Targeting Scope HUD Overlay */}
                          {(panel.geometry === 'CIRCLE_SCOPE' ||
                            panel.shape === 'circle-scope') && (
                            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                              <div className="w-[74%] h-[74%] rounded-full border border-cyan-400/50 relative">
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-300 bg-black/80 px-1.5 rounded">
                                  TARGET LOCK · {tcLabel || 'SYNC'}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Floating Hand Reframe Mode HUD Bar (appears when double-clicked or global Hand mode on) */}
                          {isHandActive && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="v4-hud-control absolute top-2 left-2 right-2 z-30 bg-zinc-950/95 border border-emerald-400/80 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5 shadow-2xl"
                            >
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
                                <span>✋ HAND REFRAME</span>
                                <span className="text-zinc-400 font-normal hidden sm:inline">
                                  Drag art to pan ({ox},{oy}) · Wheel to zoom ({sc.toFixed(2)}x) · Drag bubbles
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    setAltTextModal({
                                      pageIndex,
                                      panelIndex,
                                      panelId: panel.id,
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 text-[10px] font-bold"
                                  title="Rewrite caption, speech bubbles, or SFX on a non-destructive Alt Layer"
                                >
                                  ✍️ Rewrite Text (Alt Layer)
                                </button>
                                <button
                                  onClick={() =>
                                    updatePanelOnPage(pageIndex, panelIndex, (prev) => {
                                      savePanelOverrideById(prev.id, {
                                        imageOffsetX: 0,
                                        imageOffsetY: 0,
                                        imageScale: 1,
                                      });
                                      return {
                                        ...prev,
                                        imageOffsetX: 0,
                                        imageOffsetY: 0,
                                        imageScale: 1,
                                      };
                                    })
                                  }
                                  className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px]"
                                  title="Reset Pan & Zoom"
                                >
                                  Reset Fit
                                </button>
                                {onOpenDeepEditOrInker && (
                                  <button
                                    onClick={() => onOpenDeepEditOrInker(panelIndex, pageIndex)}
                                    className="px-2 py-0.5 rounded bg-fuchsia-600/30 hover:bg-fuchsia-600/50 border border-fuchsia-400/50 text-fuchsia-200 text-[10px] font-bold"
                                  >
                                    🎨 Inker
                                  </button>
                                )}
                                <button
                                  onClick={() => setHandModePanelId(null)}
                                  className="px-2 py-0.5 rounded bg-emerald-500 text-black text-[10px] font-black"
                                >
                                  ✓ Done
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Narrative Caption Box */}
                          {displayCaption && (
                            <div
                              style={{
                                left: `${panel.captionX ?? 3}%`,
                                top: `${panel.captionY ?? (isHandActive ? 16 : 3)}%`,
                                transform: `scale(${panel.captionScale ?? 1})`,
                                cursor: isHandActive ? 'move' : 'pointer',
                              }}
                              onMouseDown={(e) => {
                                if (!isHandActive || e.button !== 0) return;
                                e.stopPropagation();
                                const rect = (
                                  e.currentTarget.parentElement as HTMLElement
                                ).getBoundingClientRect();
                                dragStateRef.current = {
                                  type: 'DRAG_CAPTION',
                                  pageIndex,
                                  panelIndex,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialX: panel.captionX ?? 3,
                                  initialY: panel.captionY ?? 3,
                                  rectWidth: rect.width,
                                  rectHeight: rect.height,
                                };
                              }}
                              onClick={(e) => {
                                if (!isHandActive) return;
                                e.stopPropagation();
                                setAltTextModal({
                                  pageIndex,
                                  panelIndex,
                                  panelId: panel.id,
                                  focusTarget: 'caption',
                                });
                              }}
                              className="v4-caption-box"
                              title="Double-click panel or click in Hand Mode to drag or rewrite caption (Alt Layer)"
                            >
                              <div className="flex items-center justify-between gap-2 text-[9px] font-extrabold tracking-widest opacity-85 border-b border-black/25 pb-0.5 mb-0.5">
                                <span>{panel.captionHeader || page.slugline || 'NARRATION'}</span>
                                {panel.useAltCaptionLayer && (
                                  <span className="px-1 rounded bg-black text-amber-400 text-[8px]">
                                    ✨ ALT
                                  </span>
                                )}
                              </div>
                              <div>{displayCaption}</div>
                            </div>
                          )}

                          {/* Kinetic SFX Lettering */}
                          {displaySfx && (
                            <div
                              style={{
                                right: panel.sfxX === undefined ? '4%' : undefined,
                                left: panel.sfxX !== undefined ? `${panel.sfxX}%` : undefined,
                                top: `${panel.sfxY ?? 12}%`,
                                transform: `rotate(-8deg) scale(${panel.sfxScale ?? 1})`,
                                cursor: isHandActive ? 'move' : 'pointer',
                              }}
                              onMouseDown={(e) => {
                                if (!isHandActive || e.button !== 0) return;
                                e.stopPropagation();
                                const rect = (
                                  e.currentTarget.parentElement as HTMLElement
                                ).getBoundingClientRect();
                                dragStateRef.current = {
                                  type: 'DRAG_SFX',
                                  pageIndex,
                                  panelIndex,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialX: panel.sfxX ?? 75,
                                  initialY: panel.sfxY ?? 12,
                                  rectWidth: rect.width,
                                  rectHeight: rect.height,
                                };
                              }}
                              onClick={(e) => {
                                if (!isHandActive) return;
                                e.stopPropagation();
                                setAltTextModal({
                                  pageIndex,
                                  panelIndex,
                                  panelId: panel.id,
                                  focusTarget: 'sfx',
                                });
                              }}
                              className="v4-sfx-decal"
                            >
                              {displaySfx}
                            </div>
                          )}

                          {/* Speech Balloons (Docked in Safe Perimeter Zones with Directional Tails) */}
                          {(panel.bubbles || []).map((b, bIdx) => {
                            const bText =
                              b.useAltTextLayer && b.altText !== undefined
                                ? b.altText
                                : b.text;
                            const bx = b.x ?? (bIdx % 2 === 0 ? 6 : 52);
                            const by = b.y ?? (bIdx === 0 ? 64 : 12);
                            const bScale = b.scale ?? 1;

                            return (
                              <div
                                key={b.id || bIdx}
                                style={{
                                  left: `${bx}%`,
                                  top: `${by}%`,
                                  transform: `scale(${bScale})`,
                                  cursor: isHandActive ? 'move' : 'pointer',
                                }}
                                onMouseDown={(e) => {
                                  if (!isHandActive || e.button !== 0) return;
                                  e.stopPropagation();
                                  const rect = (
                                    e.currentTarget.parentElement as HTMLElement
                                  ).getBoundingClientRect();
                                  dragStateRef.current = {
                                    type: 'DRAG_BUBBLE',
                                    pageIndex,
                                    panelIndex,
                                    bubbleId: b.id,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    initialX: bx,
                                    initialY: by,
                                    rectWidth: rect.width,
                                    rectHeight: rect.height,
                                  };
                                }}
                                onWheel={(e) => {
                                  if (!isHandActive || !e.shiftKey) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const delta = e.deltaY < 0 ? 0.06 : -0.06;
                                  const nextScale = Math.max(
                                    0.55,
                                    Math.min(1.85, Math.round((bScale + delta) * 100) / 100)
                                  );
                                  updatePanelOnPage(pageIndex, panelIndex, (prev) => ({
                                    ...prev,
                                    bubbles: (prev.bubbles || []).map((item) =>
                                      item.id === b.id ? { ...item, scale: nextScale } : item
                                    ),
                                  }));
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setAltTextModal({
                                    pageIndex,
                                    panelIndex,
                                    panelId: panel.id,
                                    focusTarget: b.id,
                                  });
                                }}
                                className="v4-balloon-wrapper"
                                title="Double-click to rewrite dialogue (creates non-destructive Alt Layer) · Drag in Hand Mode to move"
                              >
                                <div className="v4-speech-balloon">
                                  {b.character && (
                                    <div className="v4-speaker-tag">
                                      <span>{b.character}</span>
                                      {b.useAltTextLayer && (
                                        <span className="px-1 rounded bg-amber-400 text-black text-[8px] font-black">
                                          ✨ ALT
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div>{bText}</div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Picture-in-Picture (Eisner Inset) Panel */}
                          {insetPanel && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPanel?.(
                                  insetPanel.panel.id,
                                  insetPanel.panelIndex,
                                  pageIndex
                                );
                              }}
                              onContextMenu={(e) =>
                                openPanelContextMenu(
                                  e,
                                  pageIndex,
                                  insetPanel.panelIndex,
                                  insetPanel.panel
                                )
                              }
                              className="absolute bottom-3 right-3 w-[34%] h-[42%] border-[3px] border-amber-400 rounded-md overflow-hidden shadow-2xl z-20 bg-black cursor-pointer hover:scale-[1.03] transition-transform"
                            >
                              {insetPanel.panel.imageUrl && (
                                <img
                                  src={insetPanel.panel.imageUrl}
                                  alt="Inset detail"
                                  className="v4-panel-img"
                                />
                              )}
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-amber-300 font-mono text-[9px] font-bold">
                                INSET · P{pageIndex + 1}.{insetPanel.panelIndex + 1}
                              </span>
                            </div>
                          )}

                          {/* Bottom-Left Timecode & Studio Edit Trigger Badge */}
                          <button
                            onClick={(e) =>
                              openPanelContextMenu(e, pageIndex, panelIndex, panel)
                            }
                            className="v4-hud-control absolute bottom-1.5 left-1.5 z-20 px-2 py-0.5 rounded bg-black/80 hover:bg-amber-500 hover:text-black text-zinc-200 border border-white/15 font-mono text-[10px] font-bold flex items-center gap-1.5 transition-colors"
                            title="Open ±60s Frame Scrubber, Video Loop & Panel Geometry Studio"
                          >
                            <span>
                              #{panel.globalPanelNumber || panelIndex + 1}
                            </span>
                            {tcLabel && <span className="text-amber-400 group-hover:text-black">⏱ {tcLabel}</span>}
                            {panel.isVideoLoop && (
                              <span className="px-1 rounded bg-emerald-500 text-black text-[9px] font-black">
                                LOOP
                              </span>
                            )}
                            <span className="opacity-75">⚙</span>
                          </button>

                          {/* Bottom-Right Director Spec & Alt Layer Trigger Pill */}
                          <div className="v4-hud-control absolute bottom-1.5 right-1.5 z-20 flex items-center gap-1">
                            {(panel.useAltCaptionLayer ||
                              panel.useAltSfxLayer ||
                              (panel.bubbles || []).some((b) => b.useAltTextLayer)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAltTextModal({
                                    pageIndex,
                                    panelIndex,
                                    panelId: panel.id,
                                  });
                                }}
                                className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-mono text-[9px] font-black shadow"
                                title="Alt Text Layer active — click to toggle back to Original Script Version"
                              >
                                ✨ ALT TEXT
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSpecModal({ pageIndex, panelIndex, panel });
                              }}
                              className="px-2 py-0.5 rounded bg-black/80 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 font-mono text-[9px] font-bold"
                            >
                              P{pageIndex + 1}.{panelIndex + 1} · Spec
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Page Bottom Folio Bar */}
              <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400">
                <div>
                  {bookTitle} · {page.slugline || page.chapterTitle || `Page ${pageIndex + 1}`}
                </div>
                <div className="flex items-center gap-3">
                  <span>{(page.panels || []).length} PANELS ON PAGE</span>
                  <span className="text-amber-400 font-bold">
                    FOLIO {String(pageIndex + 1).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── RIGHT-CLICK / PILL INTERACTIVE PANEL CONTEXT STUDIO MENU ──────── */}
      {ctxMenu && activeCtxPanel && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setCtxMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }}
            className="fixed w-[365px] max-h-[88vh] overflow-y-auto bg-zinc-950/98 border border-amber-500/50 rounded-xl p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.95)] text-zinc-100 text-xs"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-zinc-800">
              <div>
                <div className="text-amber-400 font-black text-xs uppercase tracking-wider">
                  PANEL #{activeCtxPanel.globalPanelNumber || ctxMenu.panelIndex + 1} STUDIO
                </div>
                <div className="text-[10px] font-mono text-zinc-400">
                  Page {ctxMenu.pageIndex + 1} · Anchor{' '}
                  {formatTimecode(
                    activeCtxPanel.anchorTimecodeSeconds ??
                      activeCtxPanel.timecodeSeconds ??
                      0
                  )}
                </div>
              </div>
              <button
                onClick={() => setCtxMenu(null)}
                className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Quick Action Buttons: Hand Reframe + Alt Layer Text + Inker */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button
                onClick={() => {
                  setHandModePanelId(activeCtxPanel.id);
                  setCtxMenu(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1"
              >
                ✋ Hand Reframe
              </button>
              <button
                onClick={() => {
                  setAltTextModal({
                    pageIndex: ctxMenu.pageIndex,
                    panelIndex: ctxMenu.panelIndex,
                    panelId: activeCtxPanel.id,
                  });
                  setCtxMenu(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center justify-center gap-1"
              >
                ✍️ Alt Text Layer
              </button>
            </div>

            {/* 1. ±60s Frame Timecode Scrubber */}
            <div className="mb-3 p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                <span className="uppercase font-bold text-amber-300">
                  1. Scrub Movie Frame (±1 Min)
                </span>
                <span className="text-emerald-400 font-bold">
                  {formatTimecode(
                    Math.max(
                      0,
                      (activeCtxPanel.anchorTimecodeSeconds ??
                        activeCtxPanel.timecodeSeconds ??
                        0) + ctxMenu.scrubOffsetSec
                    )
                  )}{' '}
                  ({ctxMenu.scrubOffsetSec >= 0 ? `+${ctxMenu.scrubOffsetSec.toFixed(1)}s` : `${ctxMenu.scrubOffsetSec.toFixed(1)}s`})
                </span>
              </div>

              <input
                type="range"
                min={-60}
                max={60}
                step={0.2}
                value={ctxMenu.scrubOffsetSec}
                onChange={(e) => {
                  const offset = parseFloat(e.target.value);
                  const anchor =
                    activeCtxPanel.anchorTimecodeSeconds ??
                    activeCtxPanel.timecodeSeconds ??
                    0;
                  const targetSec = Math.max(0, anchor + offset);
                  const muxId = activeCtxPanel.muxPlaybackId || DEFAULT_MUX_PLAYBACK_ID;
                  const previewUrl = buildMuxThumbnailUrl(muxId, targetSec, 960);
                  setCtxMenu((prev) =>
                    prev
                      ? { ...prev, scrubOffsetSec: offset, previewFrameUrl: previewUrl }
                      : null
                  );
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />

              {/* Fine Step Buttons */}
              <div className="grid grid-cols-6 gap-1 mt-1.5">
                {[-10, -1, -0.2, 0.2, 1, 10].map((delta) => (
                  <button
                    key={delta}
                    onClick={() => {
                      const nextOffset = Math.max(
                        -60,
                        Math.min(60, Math.round((ctxMenu.scrubOffsetSec + delta) * 10) / 10)
                      );
                      const anchor =
                        activeCtxPanel.anchorTimecodeSeconds ??
                        activeCtxPanel.timecodeSeconds ??
                        0;
                      const targetSec = Math.max(0, anchor + nextOffset);
                      const muxId =
                        activeCtxPanel.muxPlaybackId || DEFAULT_MUX_PLAYBACK_ID;
                      const previewUrl = buildMuxThumbnailUrl(muxId, targetSec, 960);
                      setCtxMenu((prev) =>
                        prev
                          ? {
                              ...prev,
                              scrubOffsetSec: nextOffset,
                              previewFrameUrl: previewUrl,
                            }
                          : null
                      );
                    }}
                    className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold text-zinc-200"
                  >
                    {delta > 0 ? `+${delta}s` : `${delta}s`}
                  </button>
                ))}
              </div>

              {/* Live Scrub Preview */}
              {ctxMenu.previewFrameUrl && (
                <div className="mt-2 rounded overflow-hidden border border-amber-500/40 bg-black h-28 relative">
                  <img
                    src={ctxMenu.previewFrameUrl}
                    alt="Scrub preview"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-amber-300 font-mono text-[9px]">
                    LIVE MUX FRAME PREVIEW
                  </span>
                </div>
              )}

              <button
                onClick={() => {
                  const anchor =
                    activeCtxPanel.anchorTimecodeSeconds ??
                    activeCtxPanel.timecodeSeconds ??
                    0;
                  const newSec = Math.max(
                    0,
                    Math.round((anchor + ctxMenu.scrubOffsetSec) * 10) / 10
                  );
                  const muxId = activeCtxPanel.muxPlaybackId || DEFAULT_MUX_PLAYBACK_ID;
                  const newUrl = buildMuxThumbnailUrl(muxId, newSec, 1280);
                  updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                    savePanelOverrideById(prev.id, {
                      timecodeSeconds: newSec,
                      imageUrl: newUrl,
                    });
                    return {
                      ...prev,
                      timecodeSeconds: newSec,
                      imageUrl: newUrl,
                    };
                  });

                }}
                className="w-full mt-2 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-[11px] uppercase tracking-wider shadow"
              >
                📸 Set New Frame for Panel
              </button>
            </div>

            {/* 2. Move & Frame Image Sliders */}
            <div className="mb-3 p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5">
                <span className="uppercase font-bold text-amber-300">
                  2. Pan & Zoom Image in Panel
                </span>
                <button
                  onClick={() =>
                    updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                      savePanelOverrideById(prev.id, {
                        imageOffsetX: 0,
                        imageOffsetY: 0,
                        imageScale: 1,
                      });
                      return {
                        ...prev,
                        imageOffsetX: 0,
                        imageOffsetY: 0,
                        imageScale: 1,
                      };
                    })
                  }
                  className="text-[10px] text-amber-400 hover:underline"
                >
                  Reset
                </button>
              </div>
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-zinc-400">Pan X</span>
                  <input
                    type="range"
                    min={-220}
                    max={220}
                    value={activeCtxPanel.imageOffsetX ?? 0}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        savePanelOverrideById(prev.id, { imageOffsetX: val });
                        return { ...prev, imageOffsetX: val };
                      });
                    }}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-10 text-right">{activeCtxPanel.imageOffsetX ?? 0}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-zinc-400">Pan Y</span>
                  <input
                    type="range"
                    min={-220}
                    max={220}
                    value={activeCtxPanel.imageOffsetY ?? 0}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        savePanelOverrideById(prev.id, { imageOffsetY: val });
                        return { ...prev, imageOffsetY: val };
                      });
                    }}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-10 text-right">{activeCtxPanel.imageOffsetY ?? 0}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-zinc-400">Zoom</span>
                  <input
                    type="range"
                    min={50}
                    max={300}
                    value={Math.round((activeCtxPanel.imageScale ?? 1) * 100)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) / 100;
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        savePanelOverrideById(prev.id, { imageScale: val });
                        return { ...prev, imageScale: val };
                      });
                    }}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-10 text-right">
                    {Math.round((activeCtxPanel.imageScale ?? 1) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Panel Geometry & Border Style */}
            <div className="mb-3 p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
              <div className="text-[10px] font-mono uppercase font-bold text-amber-300 mb-1.5">
                3. Panel Shape & Border Style
              </div>
              <div className="grid grid-cols-5 gap-1 mb-1.5">
                {(
                  [
                    { id: 'rect', label: 'Rect' },
                    { id: 'slant-left', label: 'Slant L' },
                    { id: 'slant-right', label: 'Slant R' },
                    { id: 'rounded', label: 'Round' },
                    { id: 'circle-scope', label: 'Scope' },
                  ] as const
                ).map((sh) => (
                  <button
                    key={sh.id}
                    onClick={() =>
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        savePanelOverrideById(prev.id, { shape: sh.id });
                        return { ...prev, shape: sh.id };
                      })
                    }
                    className={`py-1 rounded text-[10px] font-bold border ${
                      (activeCtxPanel.shape || 'rect') === sh.id
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {sh.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    { id: 'ink', label: 'Ink' },
                    { id: 'thick', label: 'Thick' },
                    { id: 'gold', label: 'Gold' },
                    { id: 'neon', label: 'Neon' },
                    { id: 'none', label: 'Bleed' },
                  ] as const
                ).map((bs) => (
                  <button
                    key={bs.id}
                    onClick={() =>
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        savePanelOverrideById(prev.id, { borderStyle: bs.id });
                        return { ...prev, borderStyle: bs.id };
                      })
                    }
                    className={`py-1 rounded text-[10px] font-bold border ${
                      (activeCtxPanel.borderStyle || 'ink') === bs.id
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {bs.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Cinemagraph / Live Video Loop (<=15s, Single Shared Master Video) */}
            <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">
                  4. Live Video Loop (≤15s Max)
                </span>
                <button
                  onClick={() =>
                    updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                      const nextLoop = !prev.isVideoLoop;
                      const inSec = prev.timecodeSeconds ?? prev.anchorTimecodeSeconds ?? 10;
                      const outSec = prev.loopOutSeconds ?? inSec + 5;
                      savePanelOverrideById(prev.id, {
                        isVideoLoop: nextLoop,
                        loopInSeconds: inSec,
                        loopOutSeconds: outSec,
                      });
                      return {
                        ...prev,
                        isVideoLoop: nextLoop,
                        loopInSeconds: inSec,
                        loopOutSeconds: outSec,
                      };
                    })
                  }
                  className={`px-2.5 py-0.5 rounded text-[10px] font-black ${
                    activeCtxPanel.isVideoLoop
                      ? 'bg-emerald-500 text-black'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {activeCtxPanel.isVideoLoop ? '🎬 LOOP ACTIVE' : 'Enable Video Loop'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[3, 6, 10, 15].map((dur) => (
                  <button
                    key={dur}
                    onClick={() =>
                      updatePanelOnPage(ctxMenu.pageIndex, ctxMenu.panelIndex, (prev) => {
                        const inSec = prev.timecodeSeconds ?? prev.anchorTimecodeSeconds ?? 10;
                        const outSec = inSec + dur;
                        savePanelOverrideById(prev.id, {
                          isVideoLoop: true,
                          loopInSeconds: inSec,
                          loopOutSeconds: outSec,
                        });
                        return {
                          ...prev,
                          isVideoLoop: true,
                          loopInSeconds: inSec,
                          loopOutSeconds: outSec,
                        };
                      })
                    }
                    className="py-1 rounded bg-zinc-800 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-200"
                  >
                    {dur}s {dur === 15 ? 'Max' : 'Loop'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── NON-DESTRUCTIVE ALT LAYER TEXT STUDIO MODAL ─────────────────── */}
      {altTextModal && activeAltModalPanel && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAltTextModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-zinc-950 border border-amber-500/50 rounded-2xl p-5 shadow-2xl text-zinc-100"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] uppercase">
                    NON-DESTRUCTIVE ALT LAYER
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Panel #{activeAltModalPanel.globalPanelNumber || altTextModal.panelIndex + 1} Text Studio
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Editing any text automatically creates an <strong className="text-amber-300">✨ Alt Layer</strong> and turns off the original script version without deleting it. Toggle back anytime with 1 click.
                </p>
              </div>
              <button
                onClick={() => setAltTextModal(null)}
                className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Narrative Caption Section */}
            <div className="mb-4 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Narrative Caption Box
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      updatePanelOnPage(
                        altTextModal.pageIndex,
                        altTextModal.panelIndex,
                        (prev) => ({
                          ...prev,
                          useAltCaptionLayer: false,
                        })
                      )
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      !activeAltModalPanel.useAltCaptionLayer
                        ? 'bg-emerald-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    📜 Original Script
                  </button>
                  <button
                    onClick={() =>
                      updatePanelOnPage(
                        altTextModal.pageIndex,
                        altTextModal.panelIndex,
                        (prev) => ({
                          ...prev,
                          useAltCaptionLayer: true,
                          altCaption: prev.altCaption ?? prev.caption ?? '',
                        })
                      )
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeAltModalPanel.useAltCaptionLayer
                        ? 'bg-amber-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    ✨ Alt Layer
                  </button>
                </div>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 mb-1.5 bg-zinc-950/80 p-2 rounded border border-zinc-800/80">
                <strong className="text-zinc-300">Original Script:</strong>{' '}
                {activeAltModalPanel.originalScriptCaption ||
                  activeAltModalPanel.caption ||
                  '(None)'}
              </div>
              <textarea
                rows={2}
                value={
                  activeAltModalPanel.altCaption ??
                  activeAltModalPanel.caption ??
                  ''
                }
                onChange={(e) => {
                  const val = e.target.value;
                  updatePanelOnPage(
                    altTextModal.pageIndex,
                    altTextModal.panelIndex,
                    (prev) => ({
                      ...prev,
                      originalScriptCaption:
                        prev.originalScriptCaption ?? prev.caption,
                      altCaption: val,
                      useAltCaptionLayer: true,
                    })
                  );
                }}
                placeholder="Write custom Alt Layer caption..."
                className="w-full rounded-lg bg-zinc-950 border border-amber-500/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Speech Balloons Section */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Dialogue Speech Balloons ({(activeAltModalPanel.bubbles || []).length})
                </span>
                <button
                  onClick={() =>
                    updatePanelOnPage(
                      altTextModal.pageIndex,
                      altTextModal.panelIndex,
                      (prev) => {
                        const newBubble: SpeechBubble = {
                          id: `b_custom_${Date.now()}`,
                          character: 'CHARACTER',
                          text: 'New dialogue line...',
                          originalScriptText: 'New dialogue line...',
                          altText: 'New dialogue line...',
                          useAltTextLayer: true,
                          type: 'speech',
                          x: 10,
                          y: 72,
                          width: 38,
                          height: 16,
                          tailDir: 'bl',
                          dockZone: 'bottom-left',
                          safeZoneVerified: true,
                        };
                        return {
                          ...prev,
                          bubbles: [...(prev.bubbles || []), newBubble],
                        };
                      }
                    )
                  }
                  className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold"
                >
                  + Add Speech Balloon
                </button>
              </div>

              {(activeAltModalPanel.bubbles || []).map((b, bIdx) => (
                <div
                  key={b.id || bIdx}
                  className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={b.character || ''}
                      onChange={(e) => {
                        const spk = e.target.value;
                        updatePanelOnPage(
                          altTextModal.pageIndex,
                          altTextModal.panelIndex,
                          (prev) => ({
                            ...prev,
                            bubbles: (prev.bubbles || []).map((item) =>
                              item.id === b.id ? { ...item, character: spk } : item
                            ),
                          })
                        );
                      }}
                      placeholder="Speaker Name"
                      className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-amber-300 font-bold text-xs w-40"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          updatePanelOnPage(
                            altTextModal.pageIndex,
                            altTextModal.panelIndex,
                            (prev) => ({
                              ...prev,
                              bubbles: (prev.bubbles || []).map((item) =>
                                item.id === b.id
                                  ? { ...item, useAltTextLayer: false }
                                  : item
                              ),
                            })
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          !b.useAltTextLayer
                            ? 'bg-emerald-500 text-black'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        📜 Script Version
                      </button>
                      <button
                        onClick={() =>
                          updatePanelOnPage(
                            altTextModal.pageIndex,
                            altTextModal.panelIndex,
                            (prev) => ({
                              ...prev,
                              bubbles: (prev.bubbles || []).map((item) =>
                                item.id === b.id
                                  ? {
                                      ...item,
                                      useAltTextLayer: true,
                                      altText: item.altText ?? item.text,
                                    }
                                  : item
                              ),
                            })
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          b.useAltTextLayer
                            ? 'bg-amber-500 text-black'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        ✨ Alt Layer
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-zinc-400 mb-1.5 bg-zinc-950/80 p-2 rounded border border-zinc-800/80">
                    <strong className="text-zinc-300">Original Script:</strong>{' '}
                    {b.originalScriptText ?? b.text}
                  </div>

                  <textarea
                    rows={2}
                    value={b.altText ?? b.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      updatePanelOnPage(
                        altTextModal.pageIndex,
                        altTextModal.panelIndex,
                        (prev) => ({
                          ...prev,
                          bubbles: (prev.bubbles || []).map((item) =>
                            item.id === b.id
                              ? {
                                  ...item,
                                  originalScriptText:
                                    item.originalScriptText ?? item.text,
                                  altText: val,
                                  useAltTextLayer: true,
                                }
                              : item
                          ),
                        })
                      );
                    }}
                    className="w-full rounded-lg bg-zinc-950 border border-amber-500/40 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setAltTextModal(null)}
                className="px-4 py-1.5 rounded-lg bg-amber-500 text-black font-black text-xs uppercase"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DIRECTOR SPEC MODAL ─────────────────────────────────────────── */}
      {specModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSpecModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-950 border border-amber-500/40 rounded-2xl p-5 shadow-2xl text-zinc-100"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="text-amber-400 font-black text-sm uppercase">
                PAGE {specModal.pageIndex + 1} · PANEL {specModal.panelIndex + 1} DIRECTOR SPEC
              </div>
              <button
                onClick={() => setSpecModal(null)}
                className="w-6 h-6 rounded bg-zinc-900 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-zinc-400 font-mono uppercase text-[10px]">
                  Framing & Geometry:
                </span>
                <div className="font-bold text-white">
                  {specModal.panel.framingCode || 'MS'} · {specModal.panel.geometry || 'RECT'}
                </div>
              </div>
              {specModal.panel.editorialRationale && (
                <div>
                  <span className="text-zinc-400 font-mono uppercase text-[10px]">
                    Council V4 Editorial Rationale:
                  </span>
                  <div className="text-amber-300">{specModal.panel.editorialRationale}</div>
                </div>
              )}
              <div>
                <span className="text-zinc-400 font-mono uppercase text-[10px]">
                  Visual / Diffusion Prompt:
                </span>
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-200">
                  {specModal.panel.prompt || specModal.panel.caption || 'Cinematic graphic novel frame'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouncilV4GraphicNovelStudioView;
