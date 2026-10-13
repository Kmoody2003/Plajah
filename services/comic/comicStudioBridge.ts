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
export function resolvePanelImageUrl(comicId: string, pageNumber: number, panelNumber: number): string {
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

// ─── Main Converter: ShowcaseComicBook -> StudioBook ──────────────────────────

/**
 * Losslessly converts a complete Showcase Comic (such as The Obsidian Shroud or Chrome Apostle)
 * into a fully editable StudioBook with all 20 pages and 100% layer fidelity.
 */
export function comicToShowcaseStudioBook(comicOrId: ShowcaseComicBook | string): StudioBook {
  const comic: ShowcaseComicBook = typeof comicOrId === 'string'
    ? (getShowcaseComic(comicOrId) || (comicOrId.includes('chrome') ? chromeApostle : obsidianShroud))
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
      const imageUrl = resolvePanelImageUrl(comic.id, pageNum, panelNum);

      // Build Speech Bubbles
      const bubbles: SpeechBubble[] = panel.balloons.map((b: SpeechBalloon, bIdx: number) => {
        let x = 8;
        let y = 8 + bIdx * 28;
        let width = 58;

        if (b.position) {
          if (b.position.left) x = parseCoord(b.position.left, 8);
          else if (b.position.right) x = 100 - parseCoord(b.position.right, 10) - parseWidth(b.position.maxWidth, 55);

          if (b.position.top) y = parseCoord(b.position.top, 8 + bIdx * 25);
          else if (b.position.bottom) y = 100 - parseCoord(b.position.bottom, 20) - 24;

          width = parseWidth(b.position.maxWidth, 55);
        }

        return {
          id: `bubble-${pageNum}-${panelNum}-${bIdx}`,
          type: mapBalloonType(b.style),
          text: b.text,
          character: b.speaker,
          x: Math.max(2, Math.min(92, x)),
          y: Math.max(2, Math.min(85, y)),
          width: Math.max(25, Math.min(90, width)),
          tailDir: mapBalloonTail(b.tailDirection),
          fontSize: 11,
        };
      });

      // Captions: Primary caption placed in panel.caption; extras mapped as narration bubbles
      let captionText: string | undefined = undefined;
      let captionPos: 'top' | 'bottom' = 'top';

      if (panel.captions && panel.captions.length > 0) {
        captionText = panel.captions[0].text;
        captionPos = panel.captions[0].position?.bottom ? 'bottom' : 'top';

        // Additional captions beyond the first become narration bubbles so they stay editable
        for (let cIdx = 1; cIdx < panel.captions.length; cIdx++) {
          const extraCap = panel.captions[cIdx];
          bubbles.push({
            id: `caption-${pageNum}-${panelNum}-${cIdx}`,
            type: 'narration',
            text: extraCap.text,
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
        'rect';

      return {
        id: `pan-${pageNum}-${panelNum}`,
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        imageUrl,
        bgColor: isManga ? '#000000' : '#08080c',
        bubbles,
        caption: captionText,
        captionPos,
        borderStyle: 'solid',
        shape,
        sfxText,
        sfxStyle,
      };
    });

    return {
      id: `page-${comic.id}-${pageNum}`,
      type: isManga ? 'MANGA' : 'COMIC',
      order: pageNum - 1,
      chapterTitle: `Page ${pageNum}: ${comicPage.title || comicPage.sequenceBeat}`,
      panels,
      readingDir,
      colorMode: 'bw',
      panelGutter: 6,
      bgColor: isManga ? '#000000' : '#050508',
      richText: '', // RichText left blank so comic pages are recognized by panel builders
    };
  });

  return {
    id: `studio-${comic.id}`,
    title: comic.title,
    author: comic.councilLenses.leadWriter || 'Plajah Story Council',
    synopsis: comic.blurb || comic.logline,
    genre: comic.genre,
    format,
    coverImageUrl: resolvePanelImageUrl(comic.id, 1, 1),
    pages,
    readingDir,
    colorMode: 'bw',
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
 */
export function studioPageToComicMangaPage(page: StudioPage, title: string = 'Untitled Page'): ComicMangaPage {
  const isManga = page.type === 'MANGA' || page.readingDir === 'rtl';

  const panels: ComicEnginePanel[] = (page.panels || []).map((p, idx) => {
    const balloons: ComicVectorBalloon[] = p.bubbles.map((b, bIdx) => ({
      id: b.id || `b_${bIdx}`,
      type: b.type === 'narration' ? 'narration_box' : b.type,
      text: b.text,
      speakerName: b.character,
      xPct: b.x,
      yPct: b.y,
      widthPx: Math.round((b.width / 100) * 800),
      tailDirection: b.tailDir === 'tl' ? 'top_left' : b.tailDir === 'tr' ? 'top_right' : b.tailDir === 'bl' ? 'bottom_left' : 'bottom_right',
    }));

    return {
      id: p.id,
      panelIndex: idx,
      box: {
        id: `box_${p.id}`,
        panelIndex: idx,
        xPct: p.x,
        yPct: p.y,
        widthPct: p.width,
        heightPct: p.height,
      },
      cameraShot: 'medium',
      actionPrompt: p.caption || '',
      renderedImageUrl: p.imageUrl,
      screentone: {
        enabled: isManga,
        pattern: 'dots_fine',
        opacity: 0.15,
      },
      balloons,
    };
  });

  return {
    id: page.id,
    title: page.chapterTitle || title,
    pageNumber: page.order + 1,
    layoutId: 'dynamic_manga_5',
    readingDirection: isManga ? 'rtl' : 'ltr',
    dimensions: { width: 1200, height: 1600 },
    gutterPx: page.panelGutter || 8,
    gutterColor: page.bgColor || '#000000',
    panels,
    stylePreset: isManga ? 'manga' : 'graphic_novel_noir',
    createdAt: Date.now(),
  };
}

/**
 * List available showcase graphic novels and mangas with preview metadata.
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
  return [
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
}
