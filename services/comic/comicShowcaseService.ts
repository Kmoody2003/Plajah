// services/comic/comicShowcaseService.ts — Comic & Manga Studio Showcase & Remix Engine
// Mirrors services/storybook/fromShowcase.ts for sequential art and graphic novels.

import { ShowcaseComicBook, ComicPage, SequentialPanel, SpeechBalloon, NarrativeCaption, KineticSfx } from '../../data/showcase/comicTypes';
import { SHOWCASE_COMICS, getShowcaseComic } from '../../data/showcase/comics';
import type { TelaDoc, TelaFrame, TelaDevice, TelaVectorDevice, TelaVectorObject } from '../../types';

export interface ComicRemixDraft {
  id: string;
  originalShowcaseId: string;
  ownerId: string;
  title: string;
  genre: string;
  attributionLine: string;
  councilLenses: ShowcaseComicBook['councilLenses'];
  visualGrammar: ShowcaseComicBook['visualGrammar'];
  pages: ComicPage[];
  createdTimestamp: number;
}

export interface CouncilMetricsReport {
  comicId: string;
  title: string;
  totalPages: number;
  totalPanels: number;
  averagePanelsPerPage: number;
  pacingCadence: 'high-octane-action' | 'measured-procedural' | 'meditative-sprawling';
  dialogueToArtRatio: number; // Percentage
  councilComplianceScore: number; // 0..100
  dominantPanelGeometry: string;
}

/**
 * Remix a Showcase Comic into a new user-owned editable draft.
 * Attribution is preserved under Creative Commons CC BY 4.0.
 */
export function remixComicShowcase(showcaseId: string, ownerId: string, customTitle?: string): ComicRemixDraft {
  const showcase = getShowcaseComic(showcaseId);
  if (!showcase) {
    throw new Error(`Showcase comic with ID "${showcaseId}" not found.`);
  }

  const newId = `remix-${showcase.id}-${Date.now()}`;
  const attributionLine = `Remixed from "${showcase.title}" (${showcase.councilLenses.leadArtist} / ${showcase.councilLenses.leadWriter}) via Plajah Comic & Manga Studio (CC BY 4.0).`;

  return {
    id: newId,
    originalShowcaseId: showcase.id,
    ownerId,
    title: customTitle || `${showcase.title} (Remix)`,
    genre: showcase.genre,
    attributionLine,
    councilLenses: { ...showcase.councilLenses },
    visualGrammar: JSON.parse(JSON.stringify(showcase.visualGrammar)),
    pages: JSON.parse(JSON.stringify(showcase.pages)),
    createdTimestamp: Date.now(),
  };
}

/**
 * Analyze a Showcase Comic or User Draft and compute Council Quality & Pacing Metrics.
 */
export function deriveCouncilMetrics(comic: ShowcaseComicBook | ComicRemixDraft): CouncilMetricsReport {
  const totalPages = comic.pages.length;
  let totalPanels = 0;
  let totalDialogueWords = 0;
  const geometryCounts: Record<string, number> = {};

  comic.pages.forEach(page => {
    totalPanels += page.panels.length;
    page.panels.forEach(panel => {
      geometryCounts[panel.geometry] = (geometryCounts[panel.geometry] || 0) + 1;
      panel.balloons.forEach(b => {
        totalDialogueWords += b.text.split(/\s+/).length;
      });
    });
  });

  const averagePanels = totalPages > 0 ? Number((totalPanels / totalPages).toFixed(1)) : 0;

  // Determine dominant geometry
  let dominantGeometry = 'standard-rect';
  let maxCount = 0;
  for (const [geom, count] of Object.entries(geometryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantGeometry = geom;
    }
  }

  // Pacing determination
  let pacingCadence: CouncilMetricsReport['pacingCadence'] = 'measured-procedural';
  if (averagePanels >= 4.5) pacingCadence = 'high-octane-action';
  else if (averagePanels <= 2.2) pacingCadence = 'meditative-sprawling';

  // Council compliance: penalize uniform grids (>70% rectangular) and excessive dialogue (>35 words/balloon)
  let compliance = 98;
  const rectRatio = (geometryCounts['standard-rect'] || 0) / (totalPanels || 1);
  if (rectRatio > 0.6) compliance -= 15;
  if (totalDialogueWords / (totalPanels || 1) > 28) compliance -= 10;

  return {
    comicId: comic.id,
    title: comic.title,
    totalPages,
    totalPanels,
    averagePanelsPerPage: averagePanels,
    pacingCadence,
    dialogueToArtRatio: Math.min(100, Math.round((totalDialogueWords / (totalPanels * 30)) * 100)),
    councilComplianceScore: Math.max(70, compliance),
    dominantPanelGeometry: dominantGeometry,
  };
}

/**
 * List all registered showcase titles with their Council credentials.
 */
export function getStudioShowcaseCatalog() {
  return SHOWCASE_COMICS.map(c => ({
    id: c.id,
    templateId: c.templateId,
    title: c.title,
    subtitle: c.subtitle,
    genre: c.genre,
    pageCount: c.pageCount,
    logline: c.logline,
    targetAudience: c.targetAudience,
    council: c.councilLenses,
    metrics: deriveCouncilMetrics(c),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TELA NATIVE DOCUMENT CONVERTER
// ─────────────────────────────────────────────────────────────────────────────

const COMIC_PAGE_W = 1200;
const COMIC_PAGE_H = 1600;
const GUTTER_PX = 18;
const MARGIN_PX = 32;

let vectorSeq = 0;
const nextVectorId = (prefix: string) => `${prefix}_${(++vectorSeq).toString(36)}`;

interface PanelLayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculates responsive panel geometry boxes for a given panel count.
 */
function computePagePanelBoxes(panelCount: number, pageW = COMIC_PAGE_W, pageH = COMIC_PAGE_H, margin = MARGIN_PX, gutter = GUTTER_PX): PanelLayoutBox[] {
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2 - 36; // leave room for folio
  const startX = margin;
  const startY = margin;

  if (panelCount <= 1) {
    return [{ x: startX, y: startY, w: contentW, h: contentH }];
  }

  if (panelCount === 2) {
    const ph = Math.round((contentH - gutter) / 2);
    return [
      { x: startX, y: startY, w: contentW, h: ph },
      { x: startX, y: startY + ph + gutter, w: contentW, h: ph },
    ];
  }

  if (panelCount === 3) {
    const topH = Math.round(contentH * 0.45);
    const btmH = contentH - topH - gutter;
    const halfW = Math.round((contentW - gutter) / 2);
    return [
      { x: startX, y: startY, w: contentW, h: topH },
      { x: startX, y: startY + topH + gutter, w: halfW, h: btmH },
      { x: startX + halfW + gutter, y: startY + topH + gutter, w: halfW, h: btmH },
    ];
  }

  if (panelCount === 4) {
    const halfW = Math.round((contentW - gutter) / 2);
    const halfH = Math.round((contentH - gutter) / 2);
    return [
      { x: startX, y: startY, w: halfW, h: halfH },
      { x: startX + halfW + gutter, y: startY, w: halfW, h: halfH },
      { x: startX, y: startY + halfH + gutter, w: halfW, h: halfH },
      { x: startX + halfW + gutter, y: startY + halfH + gutter, w: halfW, h: halfH },
    ];
  }

  if (panelCount === 5) {
    const topH = Math.round(contentH * 0.38);
    const midH = Math.round(contentH * 0.30);
    const btmH = contentH - topH - midH - gutter * 2;
    const halfW = Math.round((contentW - gutter) / 2);
    return [
      { x: startX, y: startY, w: contentW, h: topH },
      { x: startX, y: startY + topH + gutter, w: halfW, h: midH },
      { x: startX + halfW + gutter, y: startY + topH + gutter, w: halfW, h: midH },
      { x: startX, y: startY + topH + midH + gutter * 2, w: halfW, h: btmH },
      { x: startX + halfW + gutter, y: startY + topH + midH + gutter * 2, w: halfW, h: btmH },
    ];
  }

  // 6 panels default 2x3 grid
  const cols = 2;
  const rows = 3;
  const cw = Math.round((contentW - gutter * (cols - 1)) / cols);
  const rh = Math.round((contentH - gutter * (rows - 1)) / rows);
  const boxes: PanelLayoutBox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({
        x: startX + c * (cw + gutter),
        y: startY + r * (rh + gutter),
        w: cw,
        h: rh,
      });
    }
  }
  return boxes.slice(0, panelCount);
}

/**
 * Converts a Showcase Comic Book into a first-class, fully editable native TelaDoc.
 * Every page becomes a TelaFrame, with vector device panel grids, stroked borders,
 * speech balloons with tails, narrative captions, SFX display lettering, and folio cues.
 */
export function comicBookToTelaDoc(comic: ShowcaseComicBook, opts: { ownerId?: string; now?: number } = {}): TelaDoc {
  const now = opts.now ?? Date.now();
  const docId = `comic:${comic.id}`;
  const ownerId = opts.ownerId || 'plajah-comic-studio';

  const isManga = comic.genre === 'seinen-kinetic' || comic.genre === 'shojo-gothic';
  const groundColor = isManga ? '#FFFFFF' : '#0B0D12';
  const gutterStroke = isManga ? '#111111' : '#1A1E29';

  const frames: TelaFrame[] = [];
  const devices: Record<string, TelaDevice> = {};
  let currentY = 0;

  // ── 1. COVER FRAME ─────────────────────────────────────────────────────────
  const coverDeviceId = `${docId}:cover:vector`;
  const coverObjects: TelaVectorObject[] = [
    {
      id: nextVectorId('cv_bg'),
      kind: 'RECT',
      x: 0,
      y: 0,
      w: COMIC_PAGE_W,
      h: COMIC_PAGE_H,
      fill: isManga ? '#141419' : '#08080C',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      templateRole: 'GROUND',
    },
    // Hero Art Well
    {
      id: nextVectorId('cv_art'),
      kind: 'RECT',
      x: 48,
      y: 220,
      w: COMIC_PAGE_W - 96,
      h: COMIC_PAGE_H - 440,
      fill: isManga ? '#1F2026' : '#121520',
      stroke: '#00DAF3',
      strokeWidth: 2,
      rx: 6,
      rotation: 0,
      opacity: 1,
      templateRole: 'IMAGE_SLOT',
    },
    // Publisher Banner
    {
      id: nextVectorId('cv_pub_box'),
      kind: 'RECT',
      x: 48,
      y: 44,
      w: 220,
      h: 56,
      fill: '#FF8C00',
      stroke: '#FFFFFF',
      strokeWidth: 2,
      rx: 4,
      rotation: 0,
      opacity: 1,
      templateRole: 'LABEL',
    },
    {
      id: nextVectorId('cv_pub_text'),
      kind: 'TEXT',
      x: 56,
      y: 60,
      w: 204,
      h: 24,
      fill: '#000000',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      text: 'PLAJAH GRAPHIC NOVELS',
      fontSize: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 900,
      textAlign: 'center',
      templateRole: 'LABEL',
    },
    // Title Masthead
    {
      id: nextVectorId('cv_title'),
      kind: 'TEXT',
      x: 48,
      y: 110,
      w: COMIC_PAGE_W - 96,
      h: 96,
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 4,
      rotation: 0,
      opacity: 1,
      text: comic.title.toUpperCase(),
      fontSize: 64,
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontWeight: 900,
      textAlign: 'center',
      templateRole: 'HEADLINE',
    },
    // Subtitle & Logline
    {
      id: nextVectorId('cv_sub'),
      kind: 'TEXT',
      x: 72,
      y: COMIC_PAGE_H - 180,
      w: COMIC_PAGE_W - 144,
      h: 40,
      fill: '#94A3B8',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      text: comic.logline,
      fontSize: 18,
      fontFamily: 'Georgia, serif',
      fontWeight: 500,
      textAlign: 'center',
      templateRole: 'DECK',
    },
    // Council Credits Byline
    {
      id: nextVectorId('cv_byline'),
      kind: 'TEXT',
      x: 72,
      y: COMIC_PAGE_H - 100,
      w: COMIC_PAGE_W - 144,
      h: 28,
      fill: '#00DAF3',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      text: `STORY: ${comic.councilLenses.leadWriter.toUpperCase()} · SEQUENTIAL ART: ${comic.councilLenses.leadArtist.toUpperCase()} · ${comic.pageCount} PAGES`,
      fontSize: 13,
      fontFamily: 'Inter, monospace',
      fontWeight: 700,
      textAlign: 'center',
      templateRole: 'BYLINE',
    },
  ];

  devices[coverDeviceId] = {
    id: coverDeviceId,
    type: 'VECTOR',
    name: `${comic.title} · Cover Artboard`,
    width: COMIC_PAGE_W,
    height: COMIC_PAGE_H,
    objects: coverObjects,
  } as TelaVectorDevice;

  frames.push({
    id: `${docId}:f:cover`,
    kind: 'SCREEN',
    preset: 'FREE',
    x: 0,
    y: currentY,
    w: COMIC_PAGE_W,
    h: COMIC_PAGE_H,
    deviceIds: [coverDeviceId],
    label: `${comic.title} Cover`,
  });
  currentY += COMIC_PAGE_H + 48;

  // ── 2. SEQUENTIAL STORY PAGES ──────────────────────────────────────────────
  comic.pages.forEach((page, pageIdx) => {
    const pageDeviceId = `${docId}:p${page.pageNumber}:vector`;
    const pageObjects: TelaVectorObject[] = [];

    // Background paper / gutter ground
    pageObjects.push({
      id: nextVectorId(`p${page.pageNumber}_bg`),
      kind: 'RECT',
      x: 0,
      y: 0,
      w: COMIC_PAGE_W,
      h: COMIC_PAGE_H,
      fill: groundColor,
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      templateRole: 'GROUND',
    });

    const panelBoxes = computePagePanelBoxes(page.panels.length);

    page.panels.forEach((panel, pIdx) => {
      const box = panelBoxes[pIdx] || panelBoxes[0];

      // A. Panel Art Well (Underneath)
      pageObjects.push({
        id: nextVectorId(`p${page.pageNumber}_pan_${pIdx}_well`),
        kind: 'RECT',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        fill: isManga ? '#F3F4F6' : '#141721',
        stroke: 'none',
        strokeWidth: 0,
        rotation: 0,
        opacity: 1,
        templateRole: 'IMAGE_SLOT',
      });

      // B. Scene Description / Art Prompt Tag (for artist / live editor)
      pageObjects.push({
        id: nextVectorId(`p${page.pageNumber}_pan_${pIdx}_desc`),
        kind: 'TEXT',
        x: box.x + 16,
        y: box.y + box.h - 32,
        w: box.w - 32,
        h: 22,
        fill: isManga ? '#9CA3AF' : '#475569',
        stroke: 'none',
        strokeWidth: 0,
        rotation: 0,
        opacity: 0.8,
        text: `PANEL ${pIdx + 1} [${panel.cameraAngle.toUpperCase()}] · ${panel.eyeVector}`,
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 600,
        textAlign: 'left',
        templateRole: 'LABEL',
      });

      // C. Heavy Inked Border Frame
      pageObjects.push({
        id: nextVectorId(`p${page.pageNumber}_pan_${pIdx}_frame`),
        kind: 'RECT',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        fill: 'none',
        stroke: isManga ? '#000000' : '#0F172A',
        strokeWidth: 3.5,
        rotation: 0,
        opacity: 1,
        templateRole: 'RULE',
      });

      // D. Narrative Captions
      panel.captions.forEach((cap, cIdx) => {
        const capW = Math.min(box.w - 32, 340);
        const capH = 46;
        const capX = box.x + 14;
        const capY = box.y + 14 + cIdx * (capH + 8);

        // Caption box ground
        pageObjects.push({
          id: nextVectorId(`p${page.pageNumber}_cap_bg_${pIdx}_${cIdx}`),
          kind: 'RECT',
          x: capX,
          y: capY,
          w: capW,
          h: capH,
          fill: isManga ? '#FFFFFF' : '#0B0B0E',
          stroke: isManga ? '#111111' : '#F59E0B',
          strokeWidth: 2,
          rx: 2,
          rotation: 0,
          opacity: 0.95,
          templateRole: 'CAPTION',
        });

        // Caption lettering
        pageObjects.push({
          id: nextVectorId(`p${page.pageNumber}_cap_txt_${pIdx}_${cIdx}`),
          kind: 'TEXT',
          x: capX + 8,
          y: capY + 12,
          w: capW - 16,
          h: 24,
          fill: isManga ? '#000000' : '#F59E0B',
          stroke: 'none',
          strokeWidth: 0,
          rotation: 0,
          opacity: 1,
          text: cap.text.toUpperCase(),
          fontSize: 11,
          fontFamily: 'Courier New, monospace',
          fontWeight: 700,
          textAlign: 'left',
          templateRole: 'CAPTION',
        });
      });

      // E. Vector Speech Balloons
      panel.balloons.forEach((b, bIdx) => {
        const balloonW = Math.min(box.w - 40, Math.max(140, b.text.length * 8 + 36));
        const balloonH = Math.max(48, Math.ceil(b.text.length / 24) * 20 + 24);
        const balloonX = box.x + box.w - balloonW - 20;
        const balloonY = box.y + 24 + bIdx * (balloonH + 14);

        // Speech bubble pill
        pageObjects.push({
          id: nextVectorId(`p${page.pageNumber}_b_bg_${pIdx}_${bIdx}`),
          kind: 'RECT',
          x: balloonX,
          y: balloonY,
          w: balloonW,
          h: balloonH,
          fill: '#FFFFFF',
          stroke: b.style === 'shout' ? '#E11D48' : '#0F172A',
          strokeWidth: b.style === 'shout' ? 3 : 2,
          rx: 16,
          rotation: 0,
          opacity: 1,
          templateRole: 'BODY',
        });

        // Directional Tail
        pageObjects.push({
          id: nextVectorId(`p${page.pageNumber}_b_tail_${pIdx}_${bIdx}`),
          kind: 'PATH',
          x: balloonX + 24,
          y: balloonY + balloonH - 2,
          w: 24,
          h: 16,
          fill: '#FFFFFF',
          stroke: b.style === 'shout' ? '#E11D48' : '#0F172A',
          strokeWidth: 2,
          rotation: 0,
          opacity: 1,
          svgPathData: 'M 0 0 L 16 16 L 20 0 Z',
          templateRole: 'ORNAMENT',
        });

        // Dialogue Lettering
        pageObjects.push({
          id: nextVectorId(`p${page.pageNumber}_b_txt_${pIdx}_${bIdx}`),
          kind: 'TEXT',
          x: balloonX + 12,
          y: balloonY + 12,
          w: balloonW - 24,
          h: balloonH - 18,
          fill: b.style === 'shout' ? '#E11D48' : '#0F172A',
          stroke: 'none',
          strokeWidth: 0,
          rotation: 0,
          opacity: 1,
          text: b.text,
          fontSize: 13,
          fontFamily: '"Comic Neue", system-ui, sans-serif',
          fontWeight: 700,
          textAlign: 'center',
          templateRole: 'BODY',
        });
      });

      // F. Kinetic SFX Onomatopoeia
      if (panel.sfx && panel.sfx.length > 0) {
        panel.sfx.forEach((s, sIdx) => {
          pageObjects.push({
            id: nextVectorId(`p${page.pageNumber}_sfx_${pIdx}_${sIdx}`),
            kind: 'TEXT',
            x: box.x + box.w * 0.35,
            y: box.y + box.h * 0.45,
            w: 280,
            h: 56,
            fill: s.style === 'cyan-electric' ? '#00DAF3' : s.style === 'red-impact' ? '#EF4444' : '#F59E0B',
            stroke: '#000000',
            strokeWidth: 5,
            rotation: -10,
            opacity: 0.95,
            text: s.word.toUpperCase(),
            fontSize: 34,
            fontFamily: 'Impact, sans-serif',
            fontWeight: 900,
            textAlign: 'center',
            templateRole: 'HEADLINE',
          });
        });
      }
    });

    // G. Page Folio and Reading Direction Cue
    pageObjects.push({
      id: nextVectorId(`p${page.pageNumber}_folio`),
      kind: 'TEXT',
      x: COMIC_PAGE_W / 2 - 80,
      y: COMIC_PAGE_H - 40,
      w: 160,
      h: 24,
      fill: isManga ? '#111111' : '#64748B',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 0.8,
      text: `PAGE ${page.pageNumber} · ${page.title.toUpperCase()}`,
      fontSize: 11,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 700,
      textAlign: 'center',
      templateRole: 'FOLIO',
    });

    if (isManga) {
      pageObjects.push({
        id: nextVectorId(`p${page.pageNumber}_rtl_cue`),
        kind: 'TEXT',
        x: MARGIN_PX,
        y: COMIC_PAGE_H - 40,
        w: 220,
        h: 24,
        fill: '#9CA3AF',
        stroke: 'none',
        strokeWidth: 0,
        rotation: 0,
        opacity: 0.7,
        text: '◄ READ RIGHT TO LEFT',
        fontSize: 10,
        fontFamily: 'Inter, monospace',
        fontWeight: 800,
        textAlign: 'left',
        templateRole: 'LABEL',
      });
    }

    devices[pageDeviceId] = {
      id: pageDeviceId,
      type: 'VECTOR',
      name: `Page ${page.pageNumber}: ${page.title}`,
      width: COMIC_PAGE_W,
      height: COMIC_PAGE_H,
      objects: pageObjects,
    } as TelaVectorDevice;

    frames.push({
      id: `${docId}:f:p${page.pageNumber}`,
      kind: 'SCREEN',
      preset: 'FREE',
      x: 0,
      y: currentY,
      w: COMIC_PAGE_W,
      h: COMIC_PAGE_H,
      deviceIds: [pageDeviceId],
      label: `Page ${page.pageNumber} - ${page.title}`,
    });
    currentY += COMIC_PAGE_H + 48;
  });

  return {
    id: docId,
    ownerId,
    title: comic.title,
    frames,
    devices,
    publication: {
      kind: isManga ? 'manga' : 'comic-book',
      bookId: comic.id,
      templateId: comic.templateId,
      author: `${comic.councilLenses.leadWriter} & ${comic.councilLenses.leadArtist}`,
      license: 'CC BY-NC 4.0',
      licenseId: 'CC-BY-NC-4.0',
      ageMin: 13,
      ageMax: 99,
      language: 'en',
      aiDisclosure: 'Written by Story Intelligence & Writers Council; sequential layouts directed by Comic & Art Council; rendered via Plajah on-device GPU runtime.',
      pageCount: comic.pages.length,
    },
    createdAt: now,
    updatedAt: now,
  };
}
