// watchFolderLoopService.ts — Core engine for Watch Folder media ingestion & LoopDeck automation.
// Shared across Ambo (presentation / show slides) and Pixels (VJ / visualizer background loops).
// Handles directory picking, folder re-scanning, loop iteration tracking, and random/sequential selection.

export interface WatchFolderMediaItem {
  id: string;
  name: string;
  path: string;
  kind: 'VIDEO' | 'IMAGE' | 'AUDIO';
  url: string;
  file?: File;
  size: number;
  lastModified: number;
}

export interface WatchFolderResult {
  folderName: string;
  handle?: any; // FileSystemDirectoryHandle if available
  items: WatchFolderMediaItem[];
}

export interface LoopDeckConfig {
  enabled: boolean;
  targetLoops: number;       // Number of times each clip loops before advancing (default: 1)
  selectionMode: 'sequential' | 'random';
  watchFolderName?: string;
  watchFolderConnected?: boolean;
}

export const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|wmv)$/i;
export const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|tiff|tif)$/i;
export const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

export function classifyFileKind(name: string, mime = ''): 'VIDEO' | 'IMAGE' | 'AUDIO' {
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.test(name)) return 'VIDEO';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.test(name)) return 'IMAGE';
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.test(name)) return 'AUDIO';
  return 'VIDEO'; // default to video for media playback
}

/** Convert a list of File objects into WatchFolderMediaItems */
export function filesToMediaItems(files: File[], folderName = 'Folder'): WatchFolderMediaItem[] {
  return files
    .filter(f => VIDEO_EXTENSIONS.test(f.name) || IMAGE_EXTENSIONS.test(f.name) || AUDIO_EXTENSIONS.test(f.name))
    .map(file => {
      const kind = classifyFileKind(file.name, file.type);
      const url = typeof URL !== 'undefined' ? URL.createObjectURL(file) : '';
      return {
        id: `wfm_${file.name}_${file.size}_${file.lastModified}`,
        name: file.name,
        path: `${folderName}/${file.name}`,
        kind,
        url,
        file,
        size: file.size,
        lastModified: file.lastModified,
      };
    });
}

/**
 * Open browser directory picker (File System Access API) or fallback to input[webkitdirectory].
 */
export async function pickWatchFolder(): Promise<WatchFolderResult | null> {
  if (typeof window === 'undefined') return null;

  // 1. Try File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({
        id: 'watch-folder-loops',
        mode: 'read',
      });
      if (!handle) return null;

      const folderName = handle.name || 'Watch Folder';
      const files: File[] = [];

      // Read entries recursively or flat
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            if (VIDEO_EXTENSIONS.test(file.name) || IMAGE_EXTENSIONS.test(file.name) || AUDIO_EXTENSIONS.test(file.name)) {
              files.push(file);
            }
          } catch {
            /* skip unreadable file */
          }
        }
      }

      const items = filesToMediaItems(files, folderName);
      return { folderName, handle, items };
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      // If permission error or user cancelled, fall through to input picker
    }
  }

  // 2. Fallback to hidden directory file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as any).webkitdirectory = true;
    (input as any).directory = true;

    input.onchange = () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }
      const files = Array.from(fileList);
      // Derive folder name from relative path of first file if available
      const firstRel = (files[0] as any).webkitRelativePath || '';
      const folderName = firstRel.split('/')[0] || 'Selected Folder';
      const items = filesToMediaItems(files, folderName);
      resolve({ folderName, items });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Rescan an existing FileSystemDirectoryHandle to detect newly added or modified files.
 */
export async function rescanDirectoryHandle(
  handle: any,
  existingItems: WatchFolderMediaItem[] = []
): Promise<{ items: WatchFolderMediaItem[]; addedCount: number }> {
  if (!handle || typeof handle.values !== 'function') {
    return { items: existingItems, addedCount: 0 };
  }

  try {
    const files: File[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          if (VIDEO_EXTENSIONS.test(file.name) || IMAGE_EXTENSIONS.test(file.name) || AUDIO_EXTENSIONS.test(file.name)) {
            files.push(file);
          }
        } catch {
          /* ignore read error */
        }
      }
    }

    const existingKeys = new Set(existingItems.map(i => `${i.name}_${i.size}`));
    const newItems = filesToMediaItems(files, handle.name || 'Folder');

    let addedCount = 0;
    for (const item of newItems) {
      if (!existingKeys.has(`${item.name}_${item.size}`)) {
        addedCount++;
      }
    }

    return { items: newItems, addedCount };
  } catch {
    return { items: existingItems, addedCount: 0 };
  }
}

/**
 * Select the next item randomly from an array, avoiding the current item if multiple exist.
 */
export function selectRandomItem<T>(
  items: T[],
  current?: T,
  getId: (item: T) => string = (it: any) => (it?.id ?? String(it))
): { item: T; index: number } | null {
  if (!items || items.length === 0) return null;
  if (items.length === 1) return { item: items[0], index: 0 };

  const currentId = current ? getId(current) : null;
  const eligible = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !currentId || getId(item) !== currentId);

  const pool = eligible.length > 0 ? eligible : items.map((item, index) => ({ item, index }));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick;
}

/**
 * Select the next item sequentially (wrapping around).
 */
export function selectSequentialItem<T>(
  items: T[],
  currentIndex: number
): { item: T; index: number } | null {
  if (!items || items.length === 0) return null;
  const nextIndex = (currentIndex + 1) % items.length;
  return { item: items[nextIndex], index: nextIndex };
}

/**
 * LoopTracker class: manages counting completed loops against a target and triggering advance callbacks.
 */
export class LoopTracker {
  private targetLoops: number;
  private currentLoops = 0;
  private onAdvanceCallback?: () => void;
  private onLoopProgressCallback?: (current: number, target: number) => void;

  constructor(targetLoops = 1, onAdvance?: () => void, onProgress?: (current: number, target: number) => void) {
    this.targetLoops = Math.max(1, targetLoops);
    this.onAdvanceCallback = onAdvance;
    this.onLoopProgressCallback = onProgress;
  }

  setTargetLoops(count: number) {
    this.targetLoops = Math.max(1, count);
    this.onLoopProgressCallback?.(this.currentLoops, this.targetLoops);
  }

  getTargetLoops(): number {
    return this.targetLoops;
  }

  getCurrentLoops(): number {
    return this.currentLoops;
  }

  reset() {
    this.currentLoops = 0;
    this.onLoopProgressCallback?.(0, this.targetLoops);
  }

  /**
   * Called when a loop iteration finishes (e.g. video wraps around or ends).
   * Returns true if the target loops was reached and advance was triggered.
   */
  recordLoop(): boolean {
    this.currentLoops += 1;
    this.onLoopProgressCallback?.(this.currentLoops, this.targetLoops);

    if (this.currentLoops >= this.targetLoops) {
      this.currentLoops = 0;
      this.onAdvanceCallback?.();
      return true;
    }
    return false;
  }
}
