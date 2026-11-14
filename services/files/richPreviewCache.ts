// services/files/richPreviewCache.ts — Fast, bounded-memory rich Explorer preview cache & Chora audio engine.
// Handles:
//   1. Bounded LRU entry + byte cache (auto revokes ObjectURLs on eviction)
//   2. Tela (.tela / .tdoc / .tela-page.json) document normalization + motion/Lottie/Visualizer detection
//   3. Comic archives (.cbz / .comic / .pjc / .manga) EOCD range-sliced 4-panel downscaled extractor + motion loop/SFX detection
//   4. Chora hover single-decoder <audio> + Web Audio AnalyserNode + lightweight waveform peak extraction

import type {
  TelaDevice,
  TelaDoc,
  TelaLottieSpec,
  TelaMotionTemplateSpec,
  TelaVectorDevice,
  TelaVisualizerSpec,
} from '../../types';
import { isWindowsApp } from '../windowsBridgeService';
import { isAndroidFilesAvailable, readAndroidTextPreview } from './androidFilesBridge';
import type { StageMediaItem } from './unifiedVfs';
import { isComicFileName, isTelaFileName } from './unifiedVfs';
import { readWindowsTextPreview } from './windowsExplorerBridge';

export interface PreviewSourceTarget {
  id: string;
  name: string;
  path?: string;
  fullPath?: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
  streamUrl?: string;
  downloadUrl?: string;
  url?: string;
  locationKind?: string;
  kind?: string;
  handle?: any;
}

function sourceUrlOf(item: PreviewSourceTarget): string | undefined {
  return item.streamUrl || item.url || item.downloadUrl;
}

function sourcePathOf(item: PreviewSourceTarget): string | undefined {
  return item.fullPath || item.path;
}

export function previewCacheKeyFor(prefix: string, item: PreviewSourceTarget): string {
  const identity = sourcePathOf(item) || sourceUrlOf(item) || item.id || item.name;
  const stamp = `${item.size ?? 0}:${item.lastModified ?? 0}`;
  return `${prefix}:${identity}:${stamp}`;
}

// ── 1. Strict Bounded LRU Cache (Entries + Bytes + ObjectURL Disposal) ──────────────────────────

interface LruSlot<T> {
  value: T;
  bytes: number;
  onEvict?: (value: T, key: string) => void;
}

export class BoundedLruCache<T> {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly map = new Map<string, LruSlot<T>>();
  private totalBytes = 0;

  constructor(maxEntries = 48, maxBytes = 36 * 1024 * 1024) {
    this.maxEntries = Math.max(1, maxEntries);
    this.maxBytes = Math.max(1, maxBytes);
  }

  get(key: string): T | undefined {
    const slot = this.map.get(key);
    if (!slot) return undefined;
    // Promote to most-recently-used
    this.map.delete(key);
    this.map.set(key, slot);
    return slot.value;
  }

  set(key: string, value: T, bytes = 0, onEvict?: (value: T, key: string) => void): void {
    const safeBytes = Math.max(0, Math.round(bytes));
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes = Math.max(0, this.totalBytes - existing.bytes);
      if (existing.value !== value && existing.onEvict) {
        try {
          existing.onEvict(existing.value, key);
        } catch {
          // ignore cleanup failure
        }
      }
      this.map.delete(key);
    }

    this.map.set(key, { value, bytes: safeBytes, onEvict });
    this.totalBytes += safeBytes;

    while (this.map.size > this.maxEntries || (this.totalBytes > this.maxBytes && this.map.size > 1)) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.map.get(oldestKey);
      this.map.delete(oldestKey);
      if (oldest) {
        this.totalBytes = Math.max(0, this.totalBytes - oldest.bytes);
        if (oldest.onEvict) {
          try {
            oldest.onEvict(oldest.value, oldestKey);
          } catch {
            // ignore cleanup failure
          }
        }
      }
    }
  }

  delete(key: string): boolean {
    const slot = this.map.get(key);
    if (!slot) return false;
    this.map.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - slot.bytes);
    if (slot.onEvict) {
      try {
        slot.onEvict(slot.value, key);
      } catch {
        // ignore cleanup failure
      }
    }
    return true;
  }

  clear(): void {
    for (const [k, slot] of this.map.entries()) {
      if (slot.onEvict) {
        try {
          slot.onEvict(slot.value, k);
        } catch {
          // ignore
        }
      }
    }
    this.map.clear();
    this.totalBytes = 0;
  }

  getStats(): { entries: number; totalBytes: number } {
    return { entries: this.map.size, totalBytes: this.totalBytes };
  }
}

export interface TelaPreviewSummary {
  doc: TelaDoc;
  hasTemplateMotion: boolean;
  templateMotionTracks: number;
  templateMotionDuration: number;
  motionTemplateSpecs: TelaMotionTemplateSpec[];
  lottieSpecs: TelaLottieSpec[];
  visualizerSpecs: TelaVisualizerSpec[];
  liveFxCount: number;
  hasLivingLayer: boolean;
  hasAnyAnimation: boolean;
  motionLabels: string[];
}

export interface ComicPreviewData {
  pageUrls: string[];
  totalPageCount: number;
  title?: string;
  hasMotion: boolean;
  sfxLabels: string[];
  videoLoopUrl?: string;
  sourceByteSize: number;
}

type CachedRichEntry =
  | { kind: 'tela'; data: TelaPreviewSummary }
  | { kind: 'comic'; data: ComicPreviewData }
  | { kind: 'waveform'; data: { peaks: number[]; synthetic: boolean } };

export const richPreviewLru = new BoundedLruCache<CachedRichEntry>(48, 36 * 1024 * 1024);

function revokeComicUrls(entry: CachedRichEntry): void {
  if (entry.kind !== 'comic') return;
  for (const u of entry.data.pageUrls) {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  }
  if (entry.data.videoLoopUrl && entry.data.videoLoopUrl.startsWith('blob:')) {
    URL.revokeObjectURL(entry.data.videoLoopUrl);
  }
}

// ── 2. Tela Document Parser & Motion Scanner ─────────────────────────────────────────────────────

export function parseTelaPreviewDocument(rawText: string, fallbackName = 'Tela Document'): TelaPreviewSummary | null {
  if (!rawText || typeof rawText !== 'string') return null;
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  let doc: TelaDoc | null = null;
  let extraMotionTracks = 0;
  let extraMotionDuration = 0;

  if (parsed.format === 'plajah-tela' && parsed.document && Array.isArray(parsed.document.frames)) {
    doc = parsed.document as TelaDoc;
  } else if (parsed.format === 'plajah-tela-page' && parsed.frame && typeof parsed.devices === 'object') {
    doc = {
      id: `preview:${fallbackName}`,
      ownerId: 'preview',
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : fallbackName,
      frames: [parsed.frame],
      devices: parsed.devices,
      createdAt: 0,
      updatedAt: 0,
    };
  } else if (parsed.format === 'plajah-tela-review' && Array.isArray(parsed.templates) && parsed.templates.length > 0) {
    const tpl = parsed.templates[0];
    if (tpl?.document && Array.isArray(tpl.document.frames)) {
      doc = tpl.document as TelaDoc;
      if (tpl.motion?.tracks?.length) {
        extraMotionTracks = tpl.motion.tracks.length;
        extraMotionDuration = Number(tpl.motion.duration || 0);
      }
    }
  } else if (Array.isArray(parsed.frames) && parsed.devices && typeof parsed.devices === 'object') {
    doc = parsed as TelaDoc;
  }

  if (!doc || !Array.isArray(doc.frames) || doc.frames.length === 0) return null;

  const motionTemplateSpecs: TelaMotionTemplateSpec[] = [];
  const lottieSpecs: TelaLottieSpec[] = [];
  const visualizerSpecs: TelaVisualizerSpec[] = [];
  let liveFxCount = 0;

  const devices = Object.values(doc.devices || {}) as TelaDevice[];
  for (const dev of devices) {
    if (!dev || typeof dev !== 'object') continue;
    if (dev.type === 'VECTOR') {
      const vec = dev as TelaVectorDevice;
      for (const obj of vec.objects || []) {
        if (!obj || obj.hidden) continue;
        if (obj.kind === 'MOTION_TEMPLATE' && obj.motionTemplate) {
          motionTemplateSpecs.push(obj.motionTemplate);
        } else if (obj.kind === 'LOTTIE' && obj.lottie) {
          lottieSpecs.push(obj.lottie);
        } else if (obj.kind === 'VISUALIZER' && obj.visualizer) {
          visualizerSpecs.push(obj.visualizer);
        }
        if (obj.pixelsFx?.live) {
          liveFxCount += 1;
        }
      }
    } else if (dev.type === 'IMAGE' && (dev as any).pixelsFx?.live) {
      liveFxCount += 1;
    }
  }

  const presetTracks = doc.templatePreset?.motion?.tracks?.length ?? 0;
  const templateMotionTracks = Math.max(presetTracks, extraMotionTracks);
  const templateMotionDuration = doc.templatePreset?.motion?.duration ?? extraMotionDuration;
  const hasTemplateMotion = templateMotionTracks > 0;
  const hasLivingLayer = Boolean(
    doc.living &&
      ((doc.living.pages?.length ?? 0) > 0 || Object.keys(doc.living.scores || {}).length > 0),
  );

  const motionLabels: string[] = [];
  if (hasTemplateMotion) motionLabels.push(`Template Motion (${templateMotionTracks})`);
  if (motionTemplateSpecs.length > 0) motionLabels.push(`Motion Graphic ×${motionTemplateSpecs.length}`);
  if (lottieSpecs.length > 0) motionLabels.push(`Lottie ×${lottieSpecs.length}`);
  if (visualizerSpecs.length > 0) motionLabels.push(`Visualizer ×${visualizerSpecs.length}`);
  if (liveFxCount > 0) motionLabels.push(`Live FX ×${liveFxCount}`);
  if (hasLivingLayer) motionLabels.push('Living Audio');

  const hasAnyAnimation = motionLabels.length > 0;

  return {
    doc,
    hasTemplateMotion,
    templateMotionTracks,
    templateMotionDuration,
    motionTemplateSpecs,
    lottieSpecs,
    visualizerSpecs,
    liveFxCount,
    hasLivingLayer,
    hasAnyAnimation,
    motionLabels,
  };
}

export async function loadRichTelaPreview(
  item: PreviewSourceTarget,
  signal?: AbortSignal,
): Promise<TelaPreviewSummary | null> {
  if (!isTelaFileName(item.name, item.mimeType)) return null;
  const key = previewCacheKeyFor('tela', item);
  const cached = richPreviewLru.get(key);
  if (cached?.kind === 'tela') return cached.data;

  let text = '';
  const path = sourcePathOf(item);
  const isLocal = !item.locationKind || item.locationKind === 'local';
  const isWinLocal = isLocal && item.kind !== 'drive' && item.kind !== 'hq' && isWindowsApp();
  const isAndLocal = isLocal && item.kind !== 'drive' && item.kind !== 'hq' && isAndroidFilesAvailable();

  try {
    if (item.handle && typeof item.handle.getFile === 'function') {
      const f: File = await item.handle.getFile();
      if (f.size <= 3 * 1024 * 1024) text = await f.text();
    } else if (isWinLocal && path) {
      const res = await readWindowsTextPreview(path, 1_572_864);
      if (res.success && res.text && !res.truncated) text = res.text;
    } else if (isAndLocal && path) {
      const res = await readAndroidTextPreview(path, 1_572_864);
      if (res.success && res.text && !res.truncated) text = res.text;
    }

    if (!text) {
      const url = sourceUrlOf(item);
      if (url) {
        const res = await fetch(url, { signal });
        if (res.ok) {
          const lenHeader = Number(res.headers.get('content-length') || 0);
          if (!lenHeader || lenHeader <= 4 * 1024 * 1024) {
            text = await res.text();
          }
        }
      }
    }
  } catch {
    return null;
  }

  if (!text || signal?.aborted) return null;
  const summary = parseTelaPreviewDocument(text, item.name);
  if (!summary) return null;

  richPreviewLru.set(key, { kind: 'tela', data: summary }, Math.min(text.length * 2, 1_500_000));
  return summary;
}

// ── 3. Fast Range-Sliced Comic Book (.cbz/.comic/.pjc/.manga) Preview Extractor ──────────────────

const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm)$/i;
const META_JSON_RE = /(?:^|\/)(?:manifest|motion|book|comic|metadata)\.json$/i;

function naturalCompare(a: string, b: string): number {
  const re = /(\d+|\D+)/g;
  const pa = a.match(re) ?? [a];
  const pb = b.match(re) ?? [b];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '';
    const sb = pb[i] ?? '';
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function guessImageMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

interface ZipCentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function parseCentralDirectory(
  tailBytes: Uint8Array,
  tailStartOffset: number,
  totalSize: number,
): { cdOffset: number; cdSize: number; entries?: ZipCentralEntry[] } | null {
  const minOff = Math.max(0, tailBytes.length - 65557);
  let eocdPos = -1;
  for (let i = tailBytes.length - 22; i >= minOff; i--) {
    if (
      tailBytes[i] === 0x50 &&
      tailBytes[i + 1] === 0x4b &&
      tailBytes[i + 2] === 0x05 &&
      tailBytes[i + 3] === 0x06
    ) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) return null;

  const dv = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
  const cdSize = dv.getUint32(eocdPos + 12, true);
  const cdOffset = dv.getUint32(eocdPos + 16, true);
  if (cdOffset === 0xffffffff || cdOffset + cdSize > totalSize) return null;

  if (cdOffset < tailStartOffset) {
    return { cdOffset, cdSize };
  }

  const relStart = cdOffset - tailStartOffset;
  return {
    cdOffset,
    cdSize,
    entries: decodeCentralEntries(tailBytes, relStart, relStart + cdSize),
  };
}

function decodeCentralEntries(buf: Uint8Array, start: number, end: number): ZipCentralEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder('utf-8');
  const out: ZipCentralEntry[] = [];
  let pos = start;
  while (pos + 46 <= end && pos + 46 <= buf.length) {
    if (
      buf[pos] !== 0x50 ||
      buf[pos + 1] !== 0x4b ||
      buf[pos + 2] !== 0x01 ||
      buf[pos + 3] !== 0x02
    ) {
      break;
    }
    const method = dv.getUint16(pos + 10, true);
    const compressedSize = dv.getUint32(pos + 20, true);
    const uncompressedSize = dv.getUint32(pos + 24, true);
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const localHeaderOffset = dv.getUint32(pos + 42, true);
    const nameBytes = buf.subarray(pos + 46, pos + 46 + nameLen);
    const name = dec.decode(nameBytes);
    pos += 46 + nameLen + extraLen + commentLen;
    if (name.startsWith('__MACOSX') || name.endsWith('/')) continue;
    out.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
  }
  return out;
}

async function inflateZipEntryPayload(localHeaderAndData: Uint8Array, entry: ZipCentralEntry): Promise<Uint8Array | null> {
  if (localHeaderAndData.length < 30) return null;
  if (
    localHeaderAndData[0] !== 0x50 ||
    localHeaderAndData[1] !== 0x4b ||
    localHeaderAndData[2] !== 0x03 ||
    localHeaderAndData[3] !== 0x04
  ) {
    return null;
  }
  const dv = new DataView(localHeaderAndData.buffer, localHeaderAndData.byteOffset, localHeaderAndData.byteLength);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const dataStart = 30 + nameLen + extraLen;
  const compressed = localHeaderAndData.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method === 8 && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    const stream = new Blob([copy]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  return null;
}

async function downscaleImageBytesToUrl(
  bytes: Uint8Array,
  mime: string,
  maxLongSide = 480,
): Promise<{ url: string; byteLength: number } | null> {
  const safeCopy = new Uint8Array(bytes.byteLength);
  safeCopy.set(bytes);
  const srcBlob = new Blob([safeCopy], { type: mime });
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined' ||
    mime === 'image/gif'
  ) {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return { url: URL.createObjectURL(srcBlob), byteLength: srcBlob.size };
  }

  try {
    const bitmap = await createImageBitmap(srcBlob);
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide <= maxLongSide) {
      bitmap.close();
      return { url: URL.createObjectURL(srcBlob), byteLength: srcBlob.size };
    }
    const scale = maxLongSide / longSide;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { url: URL.createObjectURL(srcBlob), byteLength: srcBlob.size };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const outBlob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/webp', 0.82),
    );
    if (!outBlob) {
      return { url: URL.createObjectURL(srcBlob), byteLength: srcBlob.size };
    }
    return { url: URL.createObjectURL(outBlob), byteLength: outBlob.size };
  } catch {
    return { url: URL.createObjectURL(srcBlob), byteLength: srcBlob.size };
  }
}

export interface ComicRangeReader {
  totalSize: number;
  readSlice(start: number, length: number): Promise<Uint8Array>;
}

async function extractComicFromRangeReader(
  reader: ComicRangeReader,
  maxPages = 4,
): Promise<{ preview: ComicPreviewData; cachedBytes: number } | null> {
  const totalSize = reader.totalSize;
  if (totalSize < 22) return null;

  const tailLen = Math.min(totalSize, 65557);
  const tailStart = totalSize - tailLen;
  const tailBytes = await reader.readSlice(tailStart, tailLen);
  const cdInfo = parseCentralDirectory(tailBytes, tailStart, totalSize);
  if (!cdInfo || cdInfo.cdSize > 16 * 1024 * 1024) return null;

  let entries = cdInfo.entries;
  if (!entries) {
    const cdBuf = await reader.readSlice(cdInfo.cdOffset, cdInfo.cdSize);
    entries = decodeCentralEntries(cdBuf, 0, cdBuf.length);
  }
  if (!entries || entries.length === 0) return null;

  const imageEntries = entries
    .filter(e => IMG_EXT_RE.test(e.name) && e.uncompressedSize > 0 && e.uncompressedSize <= 14 * 1024 * 1024)
    .sort((a, b) => naturalCompare(a.name, b.name));

  const videoEntry = entries.find(
    e => VIDEO_EXT_RE.test(e.name) && e.uncompressedSize > 0 && e.uncompressedSize <= 8 * 1024 * 1024,
  );
  const metaEntry = entries.find(
    e => META_JSON_RE.test(e.name) && e.uncompressedSize > 0 && e.uncompressedSize <= 256 * 1024,
  );

  const selectedImages = imageEntries.slice(0, maxPages);
  if (selectedImages.length === 0 && !videoEntry) return null;

  let cachedBytes = 0;
  const pageUrls: string[] = [];

  for (const img of selectedImages) {
    try {
      const span = 30 + 512 + img.compressedSize;
      const raw = await reader.readSlice(img.localHeaderOffset, Math.min(span, totalSize - img.localHeaderOffset));
      const payload = await inflateZipEntryPayload(raw, img);
      if (!payload) continue;
      const scaled = await downscaleImageBytesToUrl(payload, guessImageMime(img.name), 480);
      if (scaled) {
        pageUrls.push(scaled.url);
        cachedBytes += scaled.byteLength;
      }
    } catch {
      // skip corrupt page cleanly
    }
  }

  let videoLoopUrl: string | undefined;
  if (videoEntry && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const span = 30 + 512 + videoEntry.compressedSize;
      const raw = await reader.readSlice(videoEntry.localHeaderOffset, Math.min(span, totalSize - videoEntry.localHeaderOffset));
      const payload = await inflateZipEntryPayload(raw, videoEntry);
      if (payload) {
        const safeVideo = new Uint8Array(payload.byteLength);
        safeVideo.set(payload);
        const mime = videoEntry.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4';
        const vBlob = new Blob([safeVideo], { type: mime });
        videoLoopUrl = URL.createObjectURL(vBlob);
        cachedBytes += vBlob.size;
      }
    } catch {
      // ignore
    }
  }

  let title: string | undefined;
  let hasMotion = Boolean(videoLoopUrl || pageUrls.length > 1);
  const sfxLabels: string[] = [];

  if (metaEntry) {
    try {
      const span = 30 + 512 + metaEntry.compressedSize;
      const raw = await reader.readSlice(metaEntry.localHeaderOffset, Math.min(span, totalSize - metaEntry.localHeaderOffset));
      const payload = await inflateZipEntryPayload(raw, metaEntry);
      if (payload) {
        const meta = JSON.parse(new TextDecoder('utf-8').decode(payload));
        if (typeof meta?.title === 'string') title = meta.title;
        if (Array.isArray(meta?.panels)) {
          for (const p of meta.panels) {
            if (p?.sfxText || p?.entrance || p?.isVideoLoop || p?.cinemagraphMode) hasMotion = true;
            if (typeof p?.sfxText === 'string' && p.sfxText.trim() && sfxLabels.length < 4) {
              sfxLabels.push(p.sfxText.trim());
            }
          }
        }
      }
    } catch {
      // ignore metadata parse error
    }
  }

  if (pageUrls.length === 0 && !videoLoopUrl) return null;

  return {
    preview: {
      pageUrls,
      totalPageCount: imageEntries.length,
      title,
      hasMotion,
      sfxLabels,
      videoLoopUrl,
      sourceByteSize: totalSize,
    },
    cachedBytes: Math.max(cachedBytes, 4096),
  };
}

export async function extractComicPreviewFromArrayBuffer(
  buffer: ArrayBuffer,
  maxPages = 4,
): Promise<{ preview: ComicPreviewData; cachedBytes: number } | null> {
  const bytes = new Uint8Array(buffer);
  return extractComicFromRangeReader(
    {
      totalSize: bytes.byteLength,
      readSlice: async (start, length) => bytes.subarray(start, Math.min(bytes.byteLength, start + length)),
    },
    maxPages,
  );
}

export async function loadRichComicPreview(
  item: PreviewSourceTarget,
  signal?: AbortSignal,
): Promise<ComicPreviewData | null> {
  if (!isComicFileName(item.name, item.mimeType)) return null;
  const ext = item.name.toLowerCase().split('.').pop() || '';
  if (ext === 'cbr') return null; // RAR archives use shell/metadata preview

  const key = previewCacheKeyFor('comic', item);
  const cached = richPreviewLru.get(key);
  if (cached?.kind === 'comic') return cached.data;

  let result: { preview: ComicPreviewData; cachedBytes: number } | null = null;

  try {
    if (item.handle && typeof item.handle.getFile === 'function') {
      const f: File = await item.handle.getFile();
      result = await extractComicFromRangeReader(
        {
          totalSize: f.size,
          readSlice: async (start, length) => new Uint8Array(await f.slice(start, start + length).arrayBuffer()),
        },
        4,
      );
    } else {
      const url = sourceUrlOf(item);
      if (url) {
        // Attempt HTTP Range probe (works directly against WinUI localmedia.plajah & range CDNs)
        const probe = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal });
        if (probe.status === 206) {
          const cr = probe.headers.get('content-range') || '';
          const totalMatch = cr.match(/\/(\d+)$/);
          const totalSize = totalMatch ? Number(totalMatch[1]) : Number(item.size || 0);
          if (totalSize > 22) {
            result = await extractComicFromRangeReader(
              {
                totalSize,
                readSlice: async (start, length) => {
                  const end = Math.min(totalSize - 1, start + length - 1);
                  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal });
                  if (!r.ok && r.status !== 206) throw new Error('Range fetch failed');
                  return new Uint8Array(await r.arrayBuffer());
                },
              },
              4,
            );
          }
        } else if (probe.ok) {
          const contentLen = Number(probe.headers.get('content-length') || item.size || 0);
          if (contentLen <= 32 * 1024 * 1024) {
            const full = await fetch(url, { signal });
            if (full.ok) {
              result = await extractComicPreviewFromArrayBuffer(await full.arrayBuffer(), 4);
            }
          }
        }
      }
    }
  } catch {
    return null;
  }

  if (!result || signal?.aborted) {
    if (result) {
      revokeComicUrls({ kind: 'comic', data: result.preview });
    }
    return null;
  }

  richPreviewLru.set(key, { kind: 'comic', data: result.preview }, result.cachedBytes, revokeComicUrls);
  return result.preview;
}

// ── 4. Chora Lightweight Waveform Peaks + Single Shared Hover Audio Engine ────────────────────────

export function buildDeterministicChoraPeaks(seed: string, targetBars = 72): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const peaks: number[] = [];
  for (let i = 0; i < targetBars; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const norm = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin(((i + 1) / (targetBars + 1)) * Math.PI);
    peaks.push(Math.max(0.12, Math.min(0.96, 0.22 + norm * 0.56 + envelope * 0.24)));
  }
  return peaks;
}

export async function loadAudioWaveformPeaks(
  item: PreviewSourceTarget,
  targetBars = 72,
  signal?: AbortSignal,
): Promise<{ peaks: number[]; synthetic: boolean }> {
  const key = previewCacheKeyFor('wave', item);
  const cached = richPreviewLru.get(key);
  if (cached?.kind === 'waveform') return cached.data;

  const fallback = { peaks: buildDeterministicChoraPeaks(item.name || item.id, targetBars), synthetic: true };

  try {
    let buffer: ArrayBuffer | null = null;
    if (item.handle && typeof item.handle.getFile === 'function') {
      const f: File = await item.handle.getFile();
      if (f.size <= 14 * 1024 * 1024) buffer = await f.arrayBuffer();
      else buffer = await f.slice(0, 4 * 1024 * 1024).arrayBuffer();
    } else {
      const url = sourceUrlOf(item);
      if (url && (!item.size || item.size <= 14 * 1024 * 1024)) {
        const res = await fetch(url, { signal });
        if (res.ok) buffer = await res.arrayBuffer();
      }
    }

    if (!buffer || signal?.aborted || typeof window === 'undefined') return fallback;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return fallback;

    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(buffer.slice(0));
      const ch = decoded.getChannelData(0);
      const step = Math.max(1, Math.floor(ch.length / targetBars));
      const peaks: number[] = [];
      let maxAmp = 0.001;
      for (let i = 0; i < targetBars; i++) {
        const start = i * step;
        const end = Math.min(ch.length, start + step);
        let peak = 0;
        const innerStride = Math.max(1, Math.floor((end - start) / 48));
        for (let j = start; j < end; j += innerStride) {
          const v = Math.abs(ch[j]);
          if (v > peak) peak = v;
        }
        if (peak > maxAmp) maxAmp = peak;
        peaks.push(peak);
      }
      const normalized = peaks.map(p => Math.max(0.08, Math.min(1, p / maxAmp)));
      const out = { peaks: normalized, synthetic: false };
      richPreviewLru.set(key, { kind: 'waveform', data: out }, targetBars * 8);
      return out;
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch {
    richPreviewLru.set(key, { kind: 'waveform', data: fallback }, targetBars * 8);
    return fallback;
  }
}

export interface ChoraHoverAudioState {
  trackKey: string | null;
  playing: boolean;
  muted: boolean;
  currentTime: number;
  duration: number;
  autoplayBlocked: boolean;
}

class ChoraHoverAudioController {
  private audio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private state: ChoraHoverAudioState = {
    trackKey: null,
    playing: false,
    muted: false,
    currentTime: 0,
    duration: 0,
    autoplayBlocked: false,
  };
  private listeners = new Set<(s: ChoraHoverAudioState) => void>();

  private ensureElements(): { audio: HTMLAudioElement; analyser: AnalyserNode | null } {
    if (!this.audio && typeof document !== 'undefined') {
      const el = document.createElement('audio');
      el.crossOrigin = 'anonymous';
      el.preload = 'metadata';
      el.volume = 0.72;
      el.addEventListener('timeupdate', () => {
        this.state = { ...this.state, currentTime: el.currentTime || 0, duration: el.duration || this.state.duration };
        this.emit();
      });
      el.addEventListener('loadedmetadata', () => {
        this.state = { ...this.state, duration: el.duration || 0 };
        this.emit();
      });
      el.addEventListener('play', () => {
        this.state = { ...this.state, playing: true, autoplayBlocked: false };
        this.emit();
      });
      el.addEventListener('pause', () => {
        this.state = { ...this.state, playing: false };
        this.emit();
      });
      el.addEventListener('ended', () => {
        this.state = { ...this.state, playing: false, currentTime: 0 };
        this.emit();
      });
      el.addEventListener('error', () => {
        if (el.crossOrigin && el.src && !el.src.startsWith('blob:')) {
          const retrySrc = el.src;
          el.crossOrigin = null;
          el.src = retrySrc;
          if (this.state.playing || this.state.autoplayBlocked) {
            el.play().catch(() => {});
          }
        }
      });
      this.audio = el;
    }

    if (this.audio && !this.analyser && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioCtx = new AudioCtx();
          const source = this.audioCtx.createMediaElementSource(this.audio);
          const analyser = this.audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.78;
          source.connect(analyser);
          analyser.connect(this.audioCtx.destination);
          this.analyser = analyser;
        } catch {
          this.analyser = null;
        }
      }
    }

    return { audio: this.audio!, analyser: this.analyser };
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.state);
  }

  subscribe(cb: (s: ChoraHoverAudioState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getState(): ChoraHoverAudioState {
    return this.state;
  }

  async playHoverTrack(trackKey: string, url: string, autoplay: boolean): Promise<void> {
    if (typeof document === 'undefined' || !url) return;
    const { audio } = this.ensureElements();
    if (this.state.trackKey !== trackKey || audio.src !== url) {
      audio.pause();
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      this.state = {
        ...this.state,
        trackKey,
        playing: false,
        currentTime: 0,
        duration: 0,
        autoplayBlocked: false,
      };
      this.emit();
    }

    if (autoplay) {
      await this.resumePlayback();
    }
  }

  async resumePlayback(): Promise<void> {
    if (!this.audio) return;
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      await this.audio.play();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.state = { ...this.state, playing: false, autoplayBlocked: true };
        this.emit();
      }
    }
  }

  async togglePlay(): Promise<void> {
    if (!this.audio) return;
    if (this.audio.paused) {
      await this.resumePlayback();
    } else {
      this.audio.pause();
    }
  }

  seekTo(seconds: number): void {
    if (!this.audio || !Number.isFinite(seconds)) return;
    const maxD = Number.isFinite(this.audio.duration) ? this.audio.duration : this.state.duration;
    this.audio.currentTime = Math.max(0, Math.min(seconds, maxD || seconds));
    this.state = { ...this.state, currentTime: this.audio.currentTime };
    this.emit();
  }

  skipBy(delta: number): void {
    if (!this.audio) return;
    this.seekTo((this.audio.currentTime || 0) + delta);
  }

  toggleMute(): void {
    if (!this.audio) return;
    this.audio.muted = !this.audio.muted;
    this.state = { ...this.state, muted: this.audio.muted };
    this.emit();
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.state = {
      trackKey: null,
      playing: false,
      muted: this.audio.muted,
      currentTime: 0,
      duration: 0,
      autoplayBlocked: false,
    };
    this.emit();
  }
}

export const choraHoverAudio = new ChoraHoverAudioController();

export function toPreviewSourceTarget(item: StageMediaItem): PreviewSourceTarget {
  return {
    id: item.id,
    name: item.name,
    path: item.fullPath,
    fullPath: item.fullPath,
    mimeType: item.mimeType,
    size: item.size,
    streamUrl: item.url,
    url: item.url,
    locationKind: item.locationKind,
  };
}
