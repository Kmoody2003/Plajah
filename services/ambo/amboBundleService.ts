// amboBundleService.ts — Packaging and bundle engine for Ambo presentations.
// Generates:
// 1. `.amboprj`: Plain JSON project manifest.
// 2. `.amboz`: Standalone ZIP bundle containing `project.json` and all media assets in `assets/`.

import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import {
  type AmboProject,
  serializeAmboProject,
  deserializeAmboProject,
  validateAmboProject,
} from './amboProjectModel';
import type { Slide, Show, LayerContent } from './showModel';

export interface ExportBundleOptions {
  includeAssets?: boolean;
  onProgress?: (percent: number, status: string) => void;
}

/** Convert a data URI to a Uint8Array */
function dataUriToUint8Array(dataUri: string): Uint8Array {
  const parts = dataUri.split(',');
  const byteString = atob(parts[1] || parts[0]);
  const u8 = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    u8[i] = byteString.charCodeAt(i);
  }
  return u8;
}

/** Safely sanitize file names for zip entry paths */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Export project as plain .amboprj JSON file */
export function exportProjectJson(project: AmboProject): Blob {
  const json = serializeAmboProject(project);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Export project as a complete standalone .amboz bundle:
 * Bundles project manifest + any local media files (images, videos, audio) into a zip.
 */
export async function exportProjectBundle(
  project: AmboProject,
  opts?: ExportBundleOptions,
): Promise<Blob> {
  const archiveFiles: Zippable = {};
  const clonedProject: AmboProject = JSON.parse(JSON.stringify(project));
  const assetTable: Record<string, string> = {};

  opts?.onProgress?.(10, 'Scanning project assets...');

  // 1. Gather all asset references across all slides in all shows
  const assetUrls: Array<{ showIdx: number; slideIdx: number; layerIdx: number; src: string; kind: string }> = [];
  clonedProject.shows.forEach((show, showIdx) => {
    show.slides.forEach((slide, slideIdx) => {
      slide.layers.forEach((layer, layerIdx) => {
        const content = layer.content;
        if (content && 'src' in content && typeof content.src === 'string' && content.src.trim()) {
          assetUrls.push({ showIdx, slideIdx, layerIdx, src: content.src, kind: content.kind });
        }
      });
    });
  });

  const total = assetUrls.length;
  let processed = 0;

  // 2. Fetch and embed each asset into archiveFiles['assets/<name>']
  for (const item of assetUrls) {
    processed++;
    opts?.onProgress?.(
      Math.min(90, 10 + Math.floor((processed / Math.max(1, total)) * 75)),
      `Bundling asset ${processed}/${total}...`
    );

    try {
      let u8: Uint8Array | null = null;
      let ext = 'bin';
      if (item.kind === 'IMAGE') ext = 'jpg';
      else if (item.kind === 'VIDEO') ext = 'mp4';
      else if (item.kind === 'AUDIO') ext = 'mp3';
      else if (item.kind === 'LOTTIE') ext = 'lottie';

      const filename = `asset_${processed}_${Date.now()}.${ext}`;

      if (item.src.startsWith('data:')) {
        u8 = dataUriToUint8Array(item.src);
      } else if (item.src.startsWith('blob:') || item.src.startsWith('http:') || item.src.startsWith('https:')) {
        const resp = await fetch(item.src);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          u8 = new Uint8Array(buf);
        }
      }

      if (u8 && u8.length > 0) {
        archiveFiles[`assets/${filename}`] = u8;
        assetTable[item.src] = `assets/${filename}`;

        // Rewrite relative link in cloned project manifest
        const targetLayer = clonedProject.shows[item.showIdx].slides[item.slideIdx].layers[item.layerIdx];
        if (targetLayer && 'src' in targetLayer.content) {
          (targetLayer.content as any).src = `asset://${filename}`;
        }
      }
    } catch (err) {
      console.warn(`Could not bundle asset ${item.src}`, err);
    }
  }

  clonedProject.assetTable = assetTable;
  opts?.onProgress?.(92, 'Creating ZIP archive manifest...');

  // 3. Add project.json to root of archive
  const manifestBytes = strToU8(JSON.stringify(clonedProject, null, 2));
  archiveFiles['project.json'] = manifestBytes;

  opts?.onProgress?.(98, 'Compressing bundle package (.amboz)...');

  // 4. Compress
  const zipped = zipSync(archiveFiles, { level: 6 });
  opts?.onProgress?.(100, 'Complete');

  return new Blob([zipped as any], { type: 'application/x-ambo-bundle' });
}

/**
 * Import a project file (.amboprj JSON or .amboz ZIP bundle).
 */
export async function importProjectFile(
  file: File | ArrayBuffer,
  filename = 'imported.amboz',
): Promise<AmboProject> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const isZip = filename.endsWith('.amboz') || filename.endsWith('.zip');

  if (!isZip) {
    // Try parsing as plain JSON .amboprj
    try {
      const text = new TextDecoder('utf-8').decode(buf);
      return deserializeAmboProject(text);
    } catch {
      // If plain JSON parse fails, attempt unzipping as fallback
    }
  }

  // Decompress ZIP container
  const u8Array = new Uint8Array(buf);
  const unzipped = unzipSync(u8Array);

  // Look for project.json or any .amboprj inside
  let manifestEntry: Uint8Array | undefined = unzipped['project.json'];
  if (!manifestEntry) {
    const foundKey = Object.keys(unzipped).find(k => k.endsWith('.amboprj') || k.endsWith('.json'));
    if (foundKey) {
      manifestEntry = unzipped[foundKey];
    }
  }

  if (!manifestEntry) {
    throw new Error('Invalid Ambo bundle: missing project.json manifest');
  }

  const jsonStr = strFromU8(manifestEntry);
  const project = deserializeAmboProject(jsonStr);

  // Extract all assets in `assets/` into in-memory blob URLs
  const resolvedAssetMap: Record<string, string> = {};
  for (const [path, entryBytes] of Object.entries(unzipped)) {
    if (path.startsWith('assets/') && entryBytes && entryBytes.length > 0) {
      const assetFilename = path.replace('assets/', '');
      let mimeType = 'application/octet-stream';
      if (assetFilename.endsWith('.jpg') || assetFilename.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (assetFilename.endsWith('.png')) mimeType = 'image/png';
      else if (assetFilename.endsWith('.webp')) mimeType = 'image/webp';
      else if (assetFilename.endsWith('.mp4') || assetFilename.endsWith('.mov')) mimeType = 'video/mp4';
      else if (assetFilename.endsWith('.mp3')) mimeType = 'audio/mpeg';
      else if (assetFilename.endsWith('.wav')) mimeType = 'audio/wav';

      const blob = new Blob([entryBytes as any], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      resolvedAssetMap[`asset://${assetFilename}`] = objectUrl;
      resolvedAssetMap[path] = objectUrl;
    }
  }

  // Replace `asset://` URIs in the project with hydrated object URLs
  project.shows.forEach(show => {
    show.slides.forEach(slide => {
      slide.layers.forEach(layer => {
        const content = layer.content;
        if (content && 'src' in content && typeof content.src === 'string') {
          if (resolvedAssetMap[content.src]) {
            content.src = resolvedAssetMap[content.src];
          }
        }
      });
    });
  });

  return project;
}

/** Helper to trigger a browser file download */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
