// amboLoopDeckService.ts — LoopDeck automation and Watch Folder slide integration for Ambo Pro Presenter.
// Supports:
// 1. LoopDeck Mode: setting how many times a clip loops before advancing to the next one
// 2. Random Selection Mode: randomly selecting the next clip/slide once it finishes loops
// 3. Watch Folder Mode: connecting the presentation to a user-selected folder to auto-play loops

import { newId, type Show, type Slide, type LoopDeckSettings } from './showModel';
import { type WatchFolderMediaItem, selectRandomItem, selectSequentialItem } from '../mediaEngine/watchFolderLoopService';

export const DEFAULT_LOOP_DECK_SETTINGS: LoopDeckSettings = {
  enabled: false,
  loopCount: 1,
  selectionMode: 'sequential',
  watchFolderConnected: false,
};

/**
 * Build an Ambo Show from watch folder media items.
 * Each video or image becomes a presentation slide with a full-bleed media background.
 */
export function createWatchFolderShow(
  folderName: string,
  items: WatchFolderMediaItem[],
  settings?: Partial<LoopDeckSettings>
): Show {
  const showId = `show_wf_${Date.now()}`;
  const slides: Slide[] = items.map((item, idx) => {
    const isVideo = item.kind === 'VIDEO';
    return {
      id: `sl_wf_${idx}_${Date.now().toString(36)}`,
      label: item.name.replace(/\.[^/.]+$/, ''),
      group: isVideo ? 'Video Loops' : 'Photos',
      groupColor: isVideo ? '#00DAF3' : '#10B981',
      layers: [
        {
          id: `ly_bg_${idx}`,
          slot: 'background',
          content: isVideo
            ? { kind: 'VIDEO', src: item.url, loop: true, muted: true }
            : { kind: 'IMAGE', src: item.url, fit: 'cover' },
        },
      ],
      // Fallback for non-video slides: advance after 5 seconds per loop
      advanceAfterSec: isVideo ? undefined : 5,
    };
  });

  return {
    id: showId,
    title: `Watch Folder: ${folderName}`,
    kind: 'MEDIA',
    slides,
    tags: ['watch-folder', 'loopdeck', folderName.toLowerCase()],
    loopDeck: {
      enabled: true,
      loopCount: settings?.loopCount ?? 1,
      selectionMode: settings?.selectionMode ?? 'random',
      watchFolderConnected: true,
      watchFolderName: folderName,
      ...settings,
    },
  };
}

/**
 * Merge newly added media files into an existing Watch Folder Show without restarting playback.
 */
export function mergeWatchFolderShow(existingShow: Show, updatedItems: WatchFolderMediaItem[]): Show {
  const existingNames = new Set(existingShow.slides.map(s => s.label));
  const newSlides: Slide[] = [];

  updatedItems.forEach((item, idx) => {
    const baseLabel = item.name.replace(/\.[^/.]+$/, '');
    if (!existingNames.has(baseLabel)) {
      const isVideo = item.kind === 'VIDEO';
      newSlides.push({
        id: `sl_wf_${existingShow.slides.length + idx}_${Date.now().toString(36)}`,
        label: baseLabel,
        group: isVideo ? 'Video Loops' : 'Photos',
        groupColor: isVideo ? '#00DAF3' : '#10B981',
        layers: [
          {
            id: `ly_bg_${existingShow.slides.length + idx}`,
            slot: 'background',
            content: isVideo
              ? { kind: 'VIDEO', src: item.url, loop: true, muted: true }
              : { kind: 'IMAGE', src: item.url, fit: 'cover' },
          },
        ],
        advanceAfterSec: isVideo ? undefined : 5,
      });
    }
  });

  if (newSlides.length === 0) return existingShow;

  return {
    ...existingShow,
    slides: [...existingShow.slides, ...newSlides],
  };
}

/**
 * Pick the next slide to display in LoopDeck mode.
 * In 'random' mode, chooses a random slide (avoiding repeating the current slide if >1 exist).
 * In 'sequential' mode, advances to the next slide in order with wrap-around.
 */
export function getNextLoopDeckSlide(
  slides: Slide[],
  currentSlideId: string | null,
  selectionMode: 'sequential' | 'random' = 'sequential'
): { slide: Slide; index: number } | null {
  if (!slides || slides.length === 0) return null;
  if (slides.length === 1) return { slide: slides[0], index: 0 };

  const currentIndex = slides.findIndex(s => s.id === currentSlideId);

  if (selectionMode === 'random') {
    const currentSlide = currentIndex >= 0 ? slides[currentIndex] : undefined;
    const picked = selectRandomItem(slides, currentSlide, s => s.id);
    return picked ? { slide: picked.item, index: picked.index } : { slide: slides[0], index: 0 };
  }

  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % slides.length : 0;
  return { slide: slides[nextIndex], index: nextIndex };
}
