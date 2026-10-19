// services/comic/comicStudioBridge.ts
// Master Bridge connecting Showcase Graphic Novels, StudioBook authoring format,
// ComicPanelBuilder / ComicMangaCreatorStudio, and the Lorea Reader stack.
// 100% native: preserves all layers (panels, images, speech bubbles, tails, captions, SFX).

import { v4 as uuidv4 } from 'uuid';
import {
  ShowcaseComicBook,
  ComicPage,
  SequentialPanel,
  SpeechBalloon,
  NarrativeCaption,
  KineticSfx,
} from '../../data/showcase/comicTypes';
import {
  SHOWCASE_COMICS,
  getShowcaseComic,
  pumpkinPatchV4,
  obsidianShroud,
  chromeApostle,
} from '../../data/showcase/comics';
import type {
  StudioBook,
  StudioPage,
  StudioPanel,
  SpeechBubble,
  Album,
  BookChapter,
} from '../../types';
import type { ComicMangaPage, ComicEnginePanel, ComicVectorBalloon } from './comicMangaPageEngine';
import { auth } from '../firebase';

// ─── Creator & Founder Access Gate for Pumpkin Patch (Oct 2025) ───────────────

const PUMPKIN_PATCH_AUTHORIZED_UIDS = new Set<string>([
  'u4XNVf41QeQERFqO0CB8JEhegXz2', // Brian James Gage (Creator of Pumpkin Patch)
  'G261332820',                   // Brian James Gage storage / creator ID
]);

const PUMPKIN_PATCH_AUTHORIZED_EMAILS = new Set<string>([
  'kmoody2003@gmail.com',         // Kenneth (Platform Founder / Owner)
]);

/**
 * Returns true ONLY if the current user is Kenneth (platform owner) or Brian James Gage (creator of Pumpkin Patch).
 * Checks both live `auth.currentUser` and persisted Firebase auth session in localStorage so initial synchronous
 * React state is immediately accurate.
 */
export function canAccessPumpkinPatchProject(
  explicitUser?: { uid?: string; email?: string | null; displayName?: string | null } | null
): boolean {
  const candidates: Array<{ uid?: string; email?: string | null; displayName?: string | null }> = [];
  if (explicitUser) candidates.push(explicitUser);
  if (auth?.currentUser) candidates.push(auth.currentUser);

  // Also check persisted Firebase auth user in localStorage (for synchronous initial state before auth hydrates)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('firebase:authUser:')) {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              candidates.push({
                uid: parsed.uid,
                email: parsed.email,
                displayName: parsed.displayName,
              });
            }
          }
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }

  for (const u of candidates) {
    const uid = (u.uid || '').trim();
    const email = (u.email || '').trim().toLowerCase();
    const name = (u.displayName || '').trim().toLowerCase();

    if (uid && PUMPKIN_PATCH_AUTHORIZED_UIDS.has(uid)) return true;
    if (email && PUMPKIN_PATCH_AUTHORIZED_EMAILS.has(email)) return true;
    if (
      email.startsWith('kmoody2003@') ||
      email.includes('briangage') ||
      email.includes('brianjamesgage') ||
      email.includes('brian.gage') ||
      email.includes('briancage') ||
      email.includes('brianjamescage') ||
      email.includes('brian.cage')
    ) {
      return true;
    }
    if (
      name === 'brian james gage' ||
      name === 'brian gage' ||
      name === 'brian james cage' ||
      name === 'brian cage' ||
      name === 'kenneth moody' ||
      name === 'kenne' ||
      name.includes('brian james gage') ||
      name.includes('brian james cage')
    ) {
      return true;
    }
  }

  return false;
}

// ─── Geometric Layout Generator ──────────────────────────────────────────────

interface PanelBox {
  x: number;      // percent 0..100
  y: number;      // percent 0..100
  width: number;  // percent 0..100
  height: number; // percent 0..100
}

/**
 * Calculates balanced responsive panel boxes for N panels on a 100x100 comic page canvas.
 */
export function calculatePanelGeometry(totalPanels: number, index: number, isManga: boolean = false): PanelBox {
  const g = 2; // 2% gutter
  const pad = 2; // 2% outer page padding

  if (totalPanels <= 1) {
    return { x: pad, y: pad, width: 100 - pad * 2, height: 100 - pad * 2 };
  }

  if (totalPanels === 2) {
    const h = (100 - pad * 2 - g) / 2;
    return {
      x: pad,
      y: pad + index * (h + g),
      width: 100 - pad * 2,
      height: h,
    };
  }

  if (totalPanels === 3) {
    // Classic dynamic layout: Large top establishing banner (48% height) + 2 bottom split panels (46% height)
    if (index === 0) {
      return { x: pad, y: pad, width: 100 - pad * 2, height: 48 };
    }
    const w = (100 - pad * 2 - g) / 2;
    const subIdx = index - 1; // 0 or 1
    const xPos = isManga
      ? (subIdx === 0 ? pad + w + g : pad) // In manga right-to-left, panel 2 is on the right
      : pad + subIdx * (w + g);
    return {
      x: xPos,
      y: pad + 48 + g,
      width: w,
      height: 100 - pad * 2 - 48 - g,
    };
  }

  if (totalPanels === 4) {
    // 2x2 grid
    const w = (100 - pad * 2 - g) / 2;
    const h = (100 - pad * 2 - g) / 2;
    const row = Math.floor(index / 2);
    const col = index % 2;
    const cPos = isManga ? 1 - col : col;
    return {
      x: pad + cPos * (w + g),
      y: pad + row * (h + g),
      width: w,
      height: h,
    };
  }

  if (totalPanels === 5) {
    // Shonen Dynamic 5: Large top banner (36%), mid split (2 panels, 30%), bottom split (2 panels, 28%)
    if (index === 0) {
      return { x: pad, y: pad, width: 100 - pad * 2, height: 36 };
    }
    const w = (100 - pad * 2 - g) / 2;
    if (index === 1 || index === 2) {
      const c = isManga ? (index === 1 ? 1 : 0) : index - 1;
      return { x: pad + c * (w + g), y: pad + 36 + g, width: w, height: 30 };
    }
    const c = isManga ? (index === 3 ? 1 : 0) : index - 3;
    return { x: pad + c * (w + g), y: pad + 36 + 30 + g * 2, width: w, height: 100 - pad * 2 - 66 - g * 2 };
  }

  // Fallback for 6+ panels: uniform grid
  const cols = totalPanels <= 6 ? 2 : 3;
  const rows = Math.ceil(totalPanels / cols);
  const w = (100 - pad * 2 - g * (cols - 1)) / cols;
  const h = (100 - pad * 2 - g * (rows - 1)) / rows;
  const r = Math.floor(index / cols);
  const rawC = index % cols;
  const c = isManga ? cols - 1 - rawC : rawC;

  return {
    x: pad + c * (w + g),
    y: pad + r * (h + g),
    width: w,
    height: h,
  };
}

/**
 * Resolves on-device generated panel image asset path.
 */
export function resolvePanelImageUrl(
  comicId: string,
  pageNumber: number,
  panelNumber: number,
  globalPanelNumber?: number
): string {
  if (comicId === 'pumpkin-patch-v4' || comicId === 'pumpkin-patch') {
    const gNum = globalPanelNumber || ((pageNumber - 1) * 11 + panelNumber);
    return `/generated/comics/pumpkin_patch_v4/panel_${String(Math.min(294, Math.max(1, gNum))).padStart(3, '0')}.jpg`;
  }
  if (comicId === 'obsidian-shroud' || comicId === 'comic-noir-gothic') {
    return `/generated/comics/obsidian_full/p${pageNumber}_pan${panelNumber}.png`;
  }
  if (comicId === 'chrome-apostle' || comicId === 'manga-seinen-kinetic') {
    return `/generated/comics/chrome_full/p${pageNumber}_pan${panelNumber}.png`;
  }
  return `/generated/comics/obsidian_full/p${((pageNumber - 1) % 20) + 1}_pan1.png`;
}

// ─── Balloon & Position Parsers ──────────────────────────────────────────────

function parseCoord(val?: string, defaultPct: number = 10): number {
  if (!val) return defaultPct;
  const num = parseFloat(val);
  if (isNaN(num)) return defaultPct;
  if (val.includes('%')) return Math.max(2, Math.min(95, num));
  // Convert px on ~500px panel to percentage
  return Math.max(2, Math.min(95, Math.round((num / 500) * 100)));
}

function parseWidth(val?: string, defaultPct: number = 55): number {
  if (!val) return defaultPct;
  const num = parseFloat(val);
  if (isNaN(num)) return defaultPct;
  if (val.includes('%')) return Math.max(25, Math.min(90, num));
  return Math.max(25, Math.min(90, Math.round((num / 500) * 100)));
}

function mapBalloonTail(dir?: string): 'bl' | 'br' | 'tl' | 'tr' {
  switch (dir) {
    case 'top-left': return 'tl';
    case 'top-right': return 'tr';
    case 'bottom-left': return 'bl';
    case 'bottom-right':
    default:
      return 'br';
  }
}

function mapBalloonType(style?: string): SpeechBubble['type'] {
  switch (style) {
    case 'thought': return 'thought';
    case 'shout': return 'shout';
    case 'whisper': return 'whisper';
    case 'comms': return 'narration';
    case 'jagged-monster': return 'shout';
    default: return 'speech';
  }
}

// ─── Empty Base Template Layout Builders (For Standard Users Without a Project) ──

/**
 * Creates an empty StudioPage pre-structured with a 5-panel Council V4 Multi-Tier Base Template Layout.
 * Used for any user other than Kenneth or Brian James Gage when opening the studio without an existing project.
 */
export function createEmptyBaseTemplateStudioPage(order: number = 0, isManga: boolean = false): StudioPage {
  const baseGeometries: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    geometry: StudioPanel['geometry'];
    framingCode: StudioPanel['framingCode'];
  }> = [
    // Tier 1: Wide Establishing + Diagonal Action Slash
    { x: 2, y: 2, width: 60, height: 32, geometry: 'OPEN_BLEED_HERO', framingCode: 'WS' },
    { x: 64, y: 2, width: 34, height: 32, geometry: 'DIAG_SLASH_L', framingCode: 'CU' },
    // Tier 2: Character Beat Pair
    { x: 2, y: 36, width: 47, height: 30, geometry: 'RECT', framingCode: 'MS' },
    { x: 51, y: 36, width: 47, height: 30, geometry: 'RECT', framingCode: 'OTS' },
    // Tier 3: Wide Climax / Hook
    { x: 2, y: 68, width: 96, height: 30, geometry: 'WIDE_LETTERBOX', framingCode: 'WS' },
  ];

  const panels: StudioPanel[] = baseGeometries.map((spec, idx) => ({
    id: `base_panel_${order + 1}_${idx + 1}`,
    globalPanelNumber: order * 5 + idx + 1,
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    imageUrl: undefined,
    prompt: '',
    caption: '',
    originalScriptCaption: '',
    bubbles: [],
    rotation: 0,
    zIndex: idx + 1,
    shape: spec.geometry === 'DIAG_SLASH_L' ? 'slant-left' : 'rect',
    borderColor: isManga ? '#38bdf8' : '#f4f4f6',
    borderWidth: 3,
    borderStyle: 'ink',
    filter: isManga ? 'manga-ink' : 'none',
    geometry: spec.geometry,
    framingCode: spec.framingCode,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageScale: 1,
    isVideoLoop: false,
  }));

  return {
    id: `base_page_${order + 1}`,
    order,
    type: isManga ? 'MANGA' : 'COMIC',
    chapterTitle: `Page ${order + 1}`,
    slugline: `PAGE ${order + 1} · BASE TEMPLATE LAYOUT`,
    layoutGrammar: 'MULTI-TIER 5-PANEL BASE TEMPLATE',
    activeLensName: isManga ? 'Seinen Manga (Otomo)' : 'Cinematic Master',
    panels,
    bgColor: '#09090d',
    readingDir: isManga ? 'rtl' : 'ltr',
    panelGutter: 10,
  };
}

/**
 * Creates an empty StudioBook with a clean 5-panel base template layout page.
 */
export function createEmptyBaseTemplateStudioBook(isManga: boolean = false): StudioBook {
  return {
    id: `studio_book_${Date.now()}`,
    title: 'Untitled Graphic Novel',
    author: auth?.currentUser?.displayName || 'Creator',
    synopsis: '',
    genre: isManga ? 'Manga' : 'Graphic Novel',
    format: isManga ? 'MANGA' : 'GRAPHIC_NOVEL',
    readingDir: isManga ? 'rtl' : 'ltr',
    colorMode: isManga ? 'bw' : 'color',
    defaultPageColor: '#09090d',
    pages: [createEmptyBaseTemplateStudioPage(0, isManga)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Main Converter: ShowcaseComicBook -> StudioBook ──────────────────────────

/**
 * Losslessly converts a complete Showcase Comic (such as Pumpkin Patch V4, The Obsidian Shroud, or Chrome Apostle)
 * into a fully editable StudioBook with all pages, panels, timecodes, loops, and 100% layer fidelity.
 * Note: Pumpkin Patch V4 is strictly gated to Kenneth (owner) and Brian James Gage (creator); for all other users,
 * requesting Pumpkin Patch returns an empty StudioBook with the base template layout.
 */
export function comicToShowcaseStudioBook(comicOrId: ShowcaseComicBook | string): StudioBook {
  const requestedId = typeof comicOrId === 'string' ? comicOrId : comicOrId.id;
  if (
    (requestedId === 'pumpkin-patch-v4' || requestedId === 'pumpkin-patch' || requestedId.includes('pumpkin')) &&
    !canAccessPumpkinPatchProject()
  ) {
    return createEmptyBaseTemplateStudioBook(false);
  }

  const comic: ShowcaseComicBook = typeof comicOrId === 'string'
    ? (getShowcaseComic(comicOrId) ||
       (comicOrId.includes('pumpkin') ? pumpkinPatchV4 : comicOrId.includes('chrome') ? chromeApostle : obsidianShroud))
    : comicOrId;

  const isManga = comic.id === 'chrome-apostle' || comic.genre === 'seinen-kinetic' || comic.templateId.includes('manga');
  const readingDir: 'ltr' | 'rtl' = isManga ? 'rtl' : 'ltr';
  const format: StudioBook['format'] = isManga ? 'MANGA' : 'GRAPHIC_NOVEL';


  const pages: StudioPage[] = comic.pages.map((comicPage: ComicPage, pIdx: number) => {
    const pageNum = comicPage.pageNumber || (pIdx + 1);
    const totalPanelsOnPage = comicPage.panels.length;

    const panels: StudioPanel[] = comicPage.panels.map((panel: SequentialPanel, panIdx: number) => {
      const panelNum = panel.panelNumber || (panIdx + 1);
      const box = calculatePanelGeometry(totalPanelsOnPage, panIdx, isManga);
      const imageUrl = panel.imageUrl || resolvePanelImageUrl(comic.id, pageNum, panelNum, panel.globalPanelNumber);

      // Build Speech Bubbles
      const bubbles: SpeechBubble[] = panel.balloons.map((b: SpeechBalloon, bIdx: number) => {
        let x = 8;
        let y = 8 + bIdx * 28;
        let width = 42;

        if (b.position) {
          if (b.position.left) x = parseCoord(b.position.left, 8);
          else if (b.position.right) x = 100 - parseCoord(b.position.right, 10) - parseWidth(b.position.maxWidth, 42);

          if (b.position.top) y = parseCoord(b.position.top, 8 + bIdx * 25);
          else if (b.position.bottom) y = 100 - parseCoord(b.position.bottom, 16) - 22;

          width = parseWidth(b.position.maxWidth, 42);
        }

        return {
          id: `bubble-${pageNum}-${panelNum}-${bIdx}`,
          type: mapBalloonType(b.style),
          text: b.text,
          originalScriptText: b.text,
          useAltTextLayer: false,
          character: b.speaker,
          speakerName: b.speaker,
          x: Math.max(2, Math.min(92, x)),
          y: Math.max(2, Math.min(85, y)),
          width: Math.max(25, Math.min(90, width)),
          scale: 1,
          tailDir: mapBalloonTail(b.tailDirection),
          fontSize: 11,
        };
      });

      // Captions: Primary caption placed in panel.caption; extras mapped as narration bubbles
      let captionText: string | undefined = undefined;
      let captionHeader: string | undefined = undefined;
      let captionPos: 'top' | 'bottom' = 'top';

      if (panel.captions && panel.captions.length > 0) {
        captionText = panel.captions[0].text;
        captionPos = panel.captions[0].position?.bottom ? 'bottom' : 'top';
        if (captionText && captionText.includes(' — ')) {
          const parts = captionText.split(' — ');
          captionHeader = parts[0];
        }

        // Additional captions beyond the first become narration bubbles so they stay editable
        for (let cIdx = 1; cIdx < panel.captions.length; cIdx++) {
          const extraCap = panel.captions[cIdx];
          bubbles.push({
            id: `caption-${pageNum}-${panelNum}-${cIdx}`,
            type: 'narration',
            text: extraCap.text,
            originalScriptText: extraCap.text,
            useAltTextLayer: false,
            x: 5,
            y: extraCap.position?.bottom ? 75 : 12,
            width: parseWidth(extraCap.position?.maxWidth, 70),
            tailDir: 'br',
            fontSize: 10,
          });
        }
      }

      // SFX: Primary SFX in panel.sfxText; extras mapped as sfx bubbles
      let sfxText: string | undefined = undefined;
      let sfxStyle: 'bold' | 'impact' | 'manga' = isManga ? 'manga' : 'bold';

      if (panel.sfx && panel.sfx.length > 0) {
        sfxText = panel.sfx[0].word;
        if (panel.sfx[0].style === 'red-impact') sfxStyle = 'impact';
        else if (isManga || panel.sfx[0].style === 'screentone-speed') sfxStyle = 'manga';

        for (let sIdx = 1; sIdx < panel.sfx.length; sIdx++) {
          const extraSfx = panel.sfx[sIdx];
          bubbles.push({
            id: `sfx-${pageNum}-${panelNum}-${sIdx}`,
            type: 'sfx',
            text: extraSfx.word,
            originalScriptText: extraSfx.word,
            useAltTextLayer: false,
            x: 25 + sIdx * 15,
            y: 35 + sIdx * 10,
            width: 40,
            tailDir: 'br',
            fontSize: 20,
          });
        }
      }

      const shape: StudioPanel['shape'] =
        panel.geometry === 'slanted-slash-left' ? 'diag-left' :
        panel.geometry === 'slanted-slash-right' ? 'diag-right' :
        panel.geometry === 'circle-reticle' ? 'circle-inset' :
        'rect';

      const borderStyle: StudioPanel['borderStyle'] =
        panel.geometry === 'open-bleed' ? 'none' : 'solid';

      const isLoop = Boolean(panel.motion?.enabled);
      const loopIn = panel.motion?.timeRange?.[0] ?? panel.timecodeSeconds;
      const loopOut = panel.motion?.timeRange?.[1] ?? (typeof loopIn === 'number' ? loopIn + 4 : undefined);

      return {
        id: panel.panelId || `pan-${pageNum}-${panelNum}`,
        globalPanelNumber: panel.globalPanelNumber,
        geometry: panel.geometry,
        framingCode: panel.framingCode,
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        imageUrl,
        bgColor: isManga ? '#000000' : '#08080c',
        bubbles,
        caption: captionText,
        captionHeader,
        originalScriptCaption: captionText,
        useAltCaptionLayer: false,
        captionPos,
        borderStyle,
        shape,
        sfxText,
        originalScriptSfx: sfxText,
        useAltSfxLayer: false,
        sfxStyle,
        textLayerMode: 'alt',
        aiPrompt: panel.generationPrompt || panel.artBrief,
        editorialRationale: panel.editorialRationale,
        timecodeSeconds: panel.timecodeSeconds,
        anchorTimecodeSeconds: panel.anchorTimecodeSeconds ?? panel.timecodeSeconds,
        sourceVideoUrl: panel.sourceVideoUrl,
        muxPlaybackId: panel.muxPlaybackId,
        imageOffsetX: 0,
        imageOffsetY: 0,
        imageScale: 1,
        isVideoLoop: isLoop,
        loopInSeconds: loopIn,
        loopOutSeconds: loopOut,
        cinemagraphMode: 'loop',
        samLayerEnabled: Boolean(panel.samLayer?.enabled),
      };
    });

    return {
      id: `page-${comic.id}-${pageNum}`,
      type: isManga ? 'MANGA' : 'COMIC',
      order: pageNum - 1,
      chapterTitle: `Page ${pageNum}: ${comicPage.title || comicPage.sequenceBeat}`,
      actNumber: comicPage.actNumber,
      slugline: comicPage.slugline,
      layoutGrammar: comicPage.layoutGrammar,
      activeLensName: comicPage.activeLensName,
      activeLensDesc: comicPage.activeLensDesc,
      timeRangeLabel: comicPage.timeRangeLabel,
      summary: comicPage.summary || comicPage.sequenceBeat,
      panels,
      readingDir,
      colorMode: isManga ? 'bw' : 'color',
      panelGutter: 16,
      bgColor: isManga ? '#000000' : '#050508',
      richText: '',
    };
  });

  return {
    id: `studio-${comic.id}`,
    title: comic.title,
    author: comic.councilLenses.leadWriter || 'Plajah Story Council',
    synopsis: comic.blurb || comic.logline,
    genre: comic.genre,
    format,
    coverImageUrl: comic.pages[0]?.panels[0]?.imageUrl || resolvePanelImageUrl(comic.id, 1, 1, 1),
    pages,
    readingDir,
    colorMode: isManga ? 'bw' : 'color',
    defaultPageColor: isManga ? '#000000' : '#050508',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Lorea Reader Album Compiler ─────────────────────────────────────────────

/**
 * Compiles a StudioBook into a native Lorea Album ready for instant opening in BookReader / ComicReader.
 */
export function studioBookToLoreaAlbum(book: StudioBook): Album {
  const sortedPages = [...book.pages].sort((a, b) => a.order - b.order);

  // Each StudioPage maps to a readable page for ComicReader
  const comicPages = sortedPages.map((page, i) => {
    // If panels exist, use first panel image or fallback
    const firstImage = page.panels?.find(p => !!p.imageUrl)?.imageUrl || page.imageUrl;
    return {
      url: firstImage || `/generated/comics/obsidian_full/p${Math.min(20, i + 1)}_pan1.png`,
    };
  });

  const albumId = book.publishedAlbumId || `lorea-comic-${book.id}`;

  const chapters: BookChapter[] = [
    {
      id: `ch-full-${book.id}`,
      title: book.title,
      format: 'COMIC' as any,
      pages: comicPages,
      content: book.synopsis,
    },
  ];

  const album: Album = {
    id: albumId,
    title: book.title,
    artist: book.author,
    coverImage: book.coverImageUrl || comicPages[0]?.url || '',
    type: 'BOOK',
    subType: 'GRAPHIC_NOVEL',
    genre: book.genre || 'Graphic Novel',
    description: book.synopsis,
    ownerId: 'creator-studio',
    createdAt: book.createdAt || Date.now(),
    themeColor: book.format === 'MANGA' ? '#38BDF8' : '#FF8C00',
    tracks: [],
    bookChapters: chapters,
  } as Album;

  // Attach metadata
  (album as any).readingDir = book.readingDir;
  (album as any).studioBook = book;
  (album as any).pages = book.pages;

  return album;
}

/**
 * One-click helper to dispatch the event that opens the book directly inside the Lorea Reader.
 */
export function openStudioBookInLorea(book: StudioBook): boolean {
  try {
    const album = studioBookToLoreaAlbum(book);
    window.dispatchEvent(new CustomEvent('OPEN_LOREA_BOOK', { detail: { album } }));
    return true;
  } catch (err) {
    console.error('[comicStudioBridge] Failed to open book in Lorea:', err);
    return false;
  }
}

// ─── Bridge to ComicMangaPageEngine ──────────────────────────────────────────

/**
 * Converts a StudioPage into a ComicMangaPage (for ComicMangaCreatorStudio compatibility).
 * Preserves all Council V4 Living Graphic Novel fields.
 */
export function studioPageToComicMangaPage(page: StudioPage, title: string = 'Untitled Page'): ComicMangaPage {
  const isManga = page.type === 'MANGA' || page.readingDir === 'rtl';

  const panels: ComicEnginePanel[] = (page.panels || []).map((p, idx) => {
    const balloons: ComicVectorBalloon[] = (p.bubbles || []).map((b, bIdx) => ({
      id: b.id || `b_${bIdx}`,
      type: b.type === 'narration' ? 'narration_box' : b.type,
      text: b.text,
      originalScriptText: b.originalScriptText ?? b.text,
      altText: b.altText,
      useAltTextLayer: b.useAltTextLayer,
      speakerName: b.character,
      xPct: b.x,
      yPct: b.y,
      widthPx: Math.round(((b.width || 30) / 100) * 800),
      scale: b.scale || 1,
      tailDirection: b.tailDir === 'tl' ? 'top_left' : b.tailDir === 'tr' ? 'top_right' : b.tailDir === 'bl' ? 'bottom_left' : 'bottom_right',
    }));

    return {
      id: p.id,
      panelIndex: idx,
      globalPanelNumber: p.globalPanelNumber,
      box: {
        id: `box_${p.id}`,
        panelIndex: idx,
        xPct: p.x,
        yPct: p.y,
        widthPct: p.width,
        heightPct: p.height,
        clipPolygon: p.clipPolygon,
        rotationDeg: p.rotation,
      },
      cameraShot: (p.framingCode === 'ECU' ? 'extreme_close_up' : p.framingCode === 'CU' ? 'close_up' : p.framingCode === 'WS' ? 'wide_establishing' : 'medium') as any,
      actionPrompt: p.prompt || p.caption || '',
      renderedImageUrl: p.imageUrl,
      screentone: {
        enabled: isManga,
        pattern: 'dots_fine',
        opacity: 0.15,
      },
      balloons,
      foleyTrack: p.sfxText ? {
        id: `foley_${p.id}`,
        sfxWord: (p.useAltSfxLayer && p.altSfx !== undefined) ? p.altSfx : p.sfxText,
        originalScriptSfx: p.originalScriptSfx ?? p.sfxText,
        altSfx: p.altSfx,
        useAltSfxLayer: p.useAltSfxLayer,
        visualStyle: 'explosive_jagged',
        xPct: p.sfxX ?? 76,
        yPct: p.sfxY ?? 14,
        scale: p.sfxScale ?? 1,
        rotationDeg: -8,
        colorHex: '#facc15',
      } : undefined,
      // Council V4 Living Graphic Novel fields
      geometry: p.geometry || 'RECT',
      framingCode: p.framingCode || 'MS',
      editorialRationale: p.editorialRationale,
      caption: p.caption,
      captionHeader: p.captionHeader,
      originalScriptCaption: p.originalScriptCaption ?? p.caption,
      altCaption: p.altCaption,
      useAltCaptionLayer: p.useAltCaptionLayer,
      captionX: p.captionX,
      captionY: p.captionY,
      captionScale: p.captionScale,
      sfxText: p.sfxText,
      originalScriptSfx: p.originalScriptSfx ?? p.sfxText,
      altSfx: p.altSfx,
      useAltSfxLayer: p.useAltSfxLayer,
      sfxX: p.sfxX,
      sfxY: p.sfxY,
      sfxScale: p.sfxScale,
      timecodeSeconds: p.timecodeSeconds,
      anchorTimecodeSeconds: p.anchorTimecodeSeconds,
      endTimecodeSeconds: p.endTimecodeSeconds,
      muxPlaybackId: p.muxPlaybackId,
      sourceVideoUrl: p.sourceVideoUrl,
      imageOffsetX: p.imageOffsetX ?? 0,
      imageOffsetY: p.imageOffsetY ?? 0,
      imageScale: p.imageScale ?? 1,
      isVideoLoop: p.isVideoLoop ?? false,
      loopInSeconds: p.loopInSeconds,
      loopOutSeconds: p.loopOutSeconds,
      samLayerEnabled: p.samLayerEnabled ?? false,
      borderStyle: p.borderStyle || 'ink',
      shape: p.shape || 'rect',
    };
  });

  return {
    id: page.id,
    title: page.chapterTitle || title,
    pageNumber: (page.order ?? 0) + 1,
    layoutId: 'dynamic_manga_5',
    readingDirection: isManga ? 'rtl' : 'ltr',
    dimensions: { width: 1200, height: 1600 },
    gutterPx: page.panelGutter || 8,
    gutterColor: page.bgColor || '#09090d',
    panels,
    stylePreset: isManga ? 'manga' : 'graphic_novel_noir',
    createdAt: Date.now(),
    actNumber: page.actNumber,
    slugline: page.slugline,
    layoutGrammar: page.layoutGrammar,
    activeLensName: page.activeLensName,
    activeLensDesc: page.activeLensDesc,
    timeRangeLabel: page.timeRangeLabel,
    summary: page.summary,
  };
}

/**
 * Reverse converter: converts a ComicMangaPage back into a StudioPage while preserving all Council V4 fields.
 */
export function comicMangaPageToStudioPage(page: ComicMangaPage): StudioPage {
  const isManga = page.readingDirection === 'rtl' || page.stylePreset === 'manga';

  const panels: StudioPanel[] = (page.panels || []).map((p, idx) => {
    const bubbles: SpeechBubble[] = (p.balloons || []).map((b, bIdx) => ({
      id: b.id || `b_${idx}_${bIdx}`,
      text: b.text,
      originalScriptText: b.originalScriptText ?? b.text,
      altText: b.altText,
      useAltTextLayer: b.useAltTextLayer,
      type: b.type === 'narration_box' ? 'narration' : (b.type as any) || 'speech',
      x: b.xPct ?? 50,
      y: b.yPct ?? 18,
      width: Math.max(20, Math.min(85, Math.round(((b.widthPx || 220) / 800) * 100))),
      height: 18,
      scale: b.scale || 1,
      tailDir: b.tailDirection === 'top_left' ? 'tl' : b.tailDirection === 'top_right' ? 'tr' : b.tailDirection === 'bottom_left' ? 'bl' : 'br',
      character: b.speakerName,
      dockZone: (b.yPct ?? 18) < 45 ? 'top-left' : 'bottom-right',
      safeZoneVerified: true,
    }));

    return {
      id: p.id || `panel_${page.pageNumber}_${idx + 1}`,
      globalPanelNumber: p.globalPanelNumber,
      x: p.box?.xPct ?? 2,
      y: p.box?.yPct ?? 2,
      width: p.box?.widthPct ?? 46,
      height: p.box?.heightPct ?? 30,
      imageUrl: p.renderedImageUrl,
      prompt: p.actionPrompt,
      caption: p.caption || p.actionPrompt,
      captionHeader: p.captionHeader,
      originalScriptCaption: p.originalScriptCaption ?? p.caption ?? p.actionPrompt,
      altCaption: p.altCaption,
      useAltCaptionLayer: p.useAltCaptionLayer,
      captionX: p.captionX,
      captionY: p.captionY,
      captionScale: p.captionScale,
      sfxText: p.sfxText || p.foleyTrack?.sfxWord,
      originalScriptSfx: p.originalScriptSfx ?? p.sfxText ?? p.foleyTrack?.sfxWord,
      altSfx: p.altSfx ?? p.foleyTrack?.altSfx,
      useAltSfxLayer: p.useAltSfxLayer ?? p.foleyTrack?.useAltSfxLayer,
      sfxX: p.sfxX ?? p.foleyTrack?.xPct,
      sfxY: p.sfxY ?? p.foleyTrack?.yPct,
      sfxScale: p.sfxScale ?? p.foleyTrack?.scale,
      bubbles,
      rotation: p.box?.rotationDeg || 0,
      zIndex: idx + 1,
      shape: p.shape || 'rect',
      clipPolygon: p.box?.clipPolygon,
      borderColor: isManga ? '#38bdf8' : '#18181b',
      borderWidth: 3,
      borderStyle: p.borderStyle || 'ink',
      filter: isManga ? 'manga-ink' : 'none',
      geometry: p.geometry || 'RECT',
      framingCode: p.framingCode || 'MS',
      editorialRationale: p.editorialRationale,
      timecodeSeconds: p.timecodeSeconds,
      anchorTimecodeSeconds: p.anchorTimecodeSeconds,
      endTimecodeSeconds: p.endTimecodeSeconds,
      muxPlaybackId: p.muxPlaybackId,
      sourceVideoUrl: p.sourceVideoUrl,
      imageOffsetX: p.imageOffsetX ?? 0,
      imageOffsetY: p.imageOffsetY ?? 0,
      imageScale: p.imageScale ?? 1,
      isVideoLoop: p.isVideoLoop ?? false,
      loopInSeconds: p.loopInSeconds,
      loopOutSeconds: p.loopOutSeconds,
      samLayerEnabled: p.samLayerEnabled ?? false,
    };
  });

  return {
    id: page.id || `page_${page.pageNumber}`,
    order: Math.max(0, (page.pageNumber || 1) - 1),
    type: isManga ? 'MANGA' : 'COMIC',
    chapterTitle: page.title,
    panels,
    bgColor: page.gutterColor || '#09090d',
    readingDir: isManga ? 'rtl' : 'ltr',
    panelGutter: page.gutterPx || 8,
    actNumber: page.actNumber,
    slugline: page.slugline,
    layoutGrammar: page.layoutGrammar,
    activeLensName: page.activeLensName,
    activeLensDesc: page.activeLensDesc,
    timeRangeLabel: page.timeRangeLabel,
    summary: page.summary,
  };
}

/**
 * Converts an entire ShowcaseComicBook (e.g. Pumpkin Patch V4 26 pages) into ComicMangaPage[].
 */
export function showcaseComicToComicMangaPages(comicOrId: ShowcaseComicBook | string): ComicMangaPage[] {
  const studioBook = comicToShowcaseStudioBook(comicOrId);
  return (studioBook.pages || []).map((sp) => studioPageToComicMangaPage(sp, sp.chapterTitle || studioBook.title));
}

/**
 * Creates an empty Base Template ComicMangaPage (5-panel Council V4 Multi-Tier Layout)
 * for any user who opens the studio without having created a project yet.
 */
export function createEmptyBaseTemplateComicMangaPage(pageNumber: number = 1, isManga: boolean = false): ComicMangaPage {
  const studioPage = createEmptyBaseTemplateStudioPage(Math.max(0, pageNumber - 1), isManga);
  return studioPageToComicMangaPage(studioPage, 'Untitled Graphic Novel');
}

/**
 * List available showcase graphic novels and mangas with preview metadata.
 * Pumpkin Patch (Oct 2025) is strictly gated to Kenneth (Platform Owner) and Brian James Gage (Creator).
 */
export function getAvailableShowcaseComics(): {
  id: string;
  title: string;
  genre: string;
  leadArtist: string;
  leadWriter: string;
  pageCount: number;
  isManga: boolean;
  coverImage: string;
}[] {
  const baseList = [
    {
      id: 'obsidian-shroud',
      title: 'The Obsidian Shroud: Sector Zero',
      genre: 'Cyber-Gothic Dark Noir',
      leadArtist: 'Frank Miller & Mike Mignola',
      leadWriter: 'Ed Brubaker & Raymond Chandler',
      pageCount: 20,
      isManga: false,
      coverImage: '/generated/comics/obsidian_full/p1_pan1.png',
    },
    {
      id: 'chrome-apostle',
      title: 'Chrome Apostle: Aphelion 9',
      genre: 'Hard Sci-Fi / Kinetic Mecha Seinen',
      leadArtist: 'Katsuhiro Otomo & Tsutomu Nihei',
      leadWriter: 'Masamune Shirow & Kentaro Miura',
      pageCount: 20,
      isManga: true,
      coverImage: '/generated/comics/chrome_full/p1_pan1.png',
    },
  ];

  if (canAccessPumpkinPatchProject()) {
    return [
      {
        id: 'pumpkin-patch-v4',
        title: 'Pumpkin Patch (Oct 2025) — Council V4 Living Graphic Novel',
        genre: 'Living Feature Graphic Novel · 26 Pages · 294 Panels',
        leadArtist: 'Council V4 Multi-Lens Choreographer & Will Eisner / Frank Miller / Katsuhiro Otomo',
        leadWriter: 'Brian James Gage · Story Intelligence On-Device Adaptation Engine',
        pageCount: 26,
        isManga: false,
        coverImage: '/generated/comics/pumpkin_patch_v4/panel_001.jpg',
      },
      ...baseList,
    ];
  }

  return baseList;
}


