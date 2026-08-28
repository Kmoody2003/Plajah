// ═══════════════════════════════════════════════════════════════════════════
// codecMatrix — Fabula's single source of truth on WHAT we can import/export,
// HOW it runs (which engine), and WHETHER it costs a licence.
//
// The one rule that governs everything here:
//
//     WHOEVER SHIPS THE ENCODER PAYS FOR IT.
//
//   • A codec provided by the BROWSER (WebCodecs / MediaRecorder / <video>) is
//     licensed by the browser VENDOR. We pay nothing for H.264/HEVC/AAC that way.
//   • A codec we DECODE or ENCODE with our own ffmpeg build is our own patent
//     problem — which is exactly why the paid ones stay decode-only or route to
//     the Crossover desktop tier (a native app can carry a GPL/source offer).
//
// This table is deliberately honest: `license` says who (if anyone) charges;
// `tier` says which engine actually runs it; `import`/`export` say the real
// directions we support today. The UI reads this so it can never promise a
// format we can't deliver, and never quietly ship a paid encoder.
//
// Cross-checked against the crossover catalog (services/crossover/formats.ts);
// that file is the ENCODER-recipe catalog, this one is the LICENCE + ENGINE
// truth. Keep the two in sync when adding a format.
// ═══════════════════════════════════════════════════════════════════════════

export type MediaKind = 'video' | 'audio' | 'image';

/** Where a codec actually runs. Ordered cheapest → most capable. */
export type Tier =
  | 'webcodecs'  // Tier 1 — the browser's own encoder/decoder. Vendor-licensed, HW-accelerated, zero cost.
  | 'wasm'       // Tier 2 — our lazy-loaded LGPL ffmpeg.wasm (isolated worker). Intra-frame codecs only.
  | 'crossover'  // Tier 3 — Crossover cloud / desktop ffmpeg. GPL ok, HW encode, RAW SDKs, >2 GB files.
  | 'native';    // Browser <video>/<img>/WebAudio can already play/decode it directly.

/**
 * Patent / royalty status — the answer to "does this cost money".
 *  - free     : royalty-free by design (VP9, AV1, Opus, FLAC, FFV1, PCM…).
 *  - expired  : was patented, all essential patents have lapsed (MPEG-2, MP3, MPEG-4p2, DV…).
 *  - vendor   : patented, but we only ever touch it through a browser encoder the
 *               VENDOR already licensed — so it costs US nothing (H.264, HEVC, AAC).
 *  - grey     : encoder exists and is widely used, but the rights-holder asserts a
 *               licence we don't hold; we ship it decode-freely / encode-labelled (ProRes).
 *  - paid     : a real per-use / per-device royalty we would owe if we shipped it
 *               ourselves (Dolby, DTS, VVC, xHE-AAC). Decode-only or never.
 */
export type License = 'free' | 'expired' | 'vendor' | 'grey' | 'paid';

export interface CodecEntry {
  id: string;
  label: string;
  kind: MediaKind;
  license: License;
  /** Engines that can DECODE it, in preference order (first available wins). */
  importTiers: Tier[];
  /** Engines that can ENCODE it, in preference order. Empty = import-only. */
  exportTiers: Tier[];
  /** Container/extensions this rides in (lowercase, no dot). */
  ext: string[];
  /** ffmpeg encoder name when a wasm/crossover export path exists. */
  encoder?: string;
  /** One honest sentence: a ceiling, a caveat, or a licence workaround. */
  note?: string;
}

const V = 'video' as const, A = 'audio' as const, I = 'image' as const;

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO
// ─────────────────────────────────────────────────────────────────────────────
export const VIDEO: CodecEntry[] = [
  // ── vendor-licensed: free to US because the browser carries the licence ──
  {
    id: 'h264', label: 'H.264 / AVC', kind: V, license: 'vendor',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['mp4', 'mov', 'm4v', 'ts', 'mkv'], encoder: 'libx264',
    note: 'Free via WebCodecs — the browser vendor holds the AVC licence. Never ship our own x264.',
  },
  {
    id: 'hevc', label: 'H.265 / HEVC', kind: V, license: 'vendor',
    importTiers: ['native', 'webcodecs', 'crossover'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['mp4', 'mov', 'hevc', 'mkv'], encoder: 'libx265',
    note: 'Encode via WebCodecs only where the OS provides it; three patent pools make shipping our own untenable.',
  },
  // ── royalty-free ──
  {
    id: 'av1', label: 'AV1', kind: V, license: 'free',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['mp4', 'webm', 'mkv', 'ivf'], encoder: 'libsvtav1',
    note: 'AOMedia royalty-free. The Access Advance pool is not paid by YouTube/Netflix/browsers — treat as free.',
  },
  {
    id: 'vp9', label: 'VP9', kind: V, license: 'free',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['webm', 'mkv'], encoder: 'libvpx-vp9', note: 'Royalty-free, browser-native.',
  },
  {
    id: 'vp8', label: 'VP8', kind: V, license: 'free',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['webm', 'mkv'], encoder: 'libvpx', note: 'Royalty-free.',
  },
  {
    id: 'theora', label: 'Theora', kind: V, license: 'free',
    importTiers: ['native', 'wasm'], exportTiers: ['crossover'], ext: ['ogv', 'ogg'], encoder: 'libtheora',
  },
  // ── patent-EXPIRED: fully free in both directions, LGPL ffmpeg (no --enable-gpl) ──
  {
    id: 'mpeg2', label: 'MPEG-2 / H.262', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['mpg', 'mpeg', 'm2v', 'ts', 'm2ts', 'mts', 'vob', 'mxf', 'mov'], encoder: 'mpeg2video',
    note: 'Last essential patent expired Feb 2018. In the LGPL ffmpeg core — full import AND export, no royalty.',
  },
  {
    id: 'mpeg1', label: 'MPEG-1', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['mpg', 'mpeg', 'm1v'], encoder: 'mpeg1video', note: 'Expired.',
  },
  {
    id: 'mpeg4p2', label: 'MPEG-4 Part 2 (Xvid/DivX)', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['avi', 'mp4', 'mkv'], encoder: 'mpeg4', note: 'Expired.',
  },
  {
    id: 'dv', label: 'DV / DVCPRO / DVCPRO50 / HD', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['dv', 'avi', 'mov', 'mxf'], encoder: 'dvvideo', note: 'Expired, LGPL. Classic tape acquisition.',
  },
  {
    id: 'mjpeg', label: 'Motion JPEG', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['avi', 'mov', 'mkv'], encoder: 'mjpeg', note: 'Free.',
  },
  {
    id: 'jpeg2000', label: 'JPEG 2000', kind: V, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['crossover'],
    ext: ['mxf', 'mov', 'j2k', 'jp2'], encoder: 'jpeg2000', note: 'DCP / IMF intra-frame. Expired.',
  },
  // ── free intermediates: the ProRes-free mastering path ──
  {
    id: 'dnxhr', label: 'Avid DNxHR / DNxHD (VC-3)', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['mxf', 'mov'], encoder: 'dnxhd',
    note: 'THE free ProRes replacement — Avid published the spec. Default mastering export.',
  },
  {
    id: 'cineform', label: 'GoPro CineForm (VC-5)', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['crossover'],
    ext: ['mov', 'avi'], encoder: 'cfhd', note: 'Apache-2.0 — GoPro open-sourced it.',
  },
  // ── lossless / archival: all free ──
  {
    id: 'ffv1', label: 'FFV1 (lossless)', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['mkv', 'mov', 'avi'], encoder: 'ffv1', note: 'Lossless archival standard (Library of Congress).',
  },
  {
    id: 'utvideo', label: 'Ut Video (lossless)', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['avi', 'mkv'], encoder: 'utvideo', note: 'Free lossless.',
  },
  {
    id: 'v210', label: 'v210 (10-bit uncompressed)', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['mov', 'mxf', 'avi'], encoder: 'v210', note: 'Uncompressed 4:2:2 10-bit. Free.',
  },
  {
    id: 'imgseq', label: 'DPX / EXR / TIFF / PNG sequence', kind: V, license: 'free',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'],
    ext: ['dpx', 'exr', 'tiff', 'tif', 'png'], note: 'Frame-sequence DI pipeline. All free.',
  },
  // ── GREY: encoder exists, rights-holder asserts a licence we don't hold ──
  {
    id: 'prores', label: 'Apple ProRes', kind: V, license: 'grey',
    importTiers: ['wasm', 'crossover'], exportTiers: ['crossover'], ext: ['mov', 'mxf'], encoder: 'prores_ks',
    note: 'Import freely. Encode is Apple-certified-only in theory; ffmpeg\'s clean-room prores_ks is offered as "unofficial". Prefer DNxHR for mastering.',
  },
  // ── camera RAW: free SDKs, but native-only and EULA-bound — Crossover desktop only ──
  {
    id: 'braw', label: 'Blackmagic RAW', kind: V, license: 'grey',
    importTiers: ['crossover'], exportTiers: [], ext: ['braw'],
    note: 'Decode-only via the free BRAW SDK (native, EULA). No tool can freely ENCODE BRAW.',
  },
  {
    id: 'r3d', label: 'RED R3D', kind: V, license: 'grey',
    importTiers: ['crossover'], exportTiers: [], ext: ['r3d'],
    note: 'Decode via RED SDK (free, native, NDA). Never encodable outside RED.',
  },
  {
    id: 'arriraw', label: 'ARRIRAW', kind: V, license: 'grey',
    importTiers: ['crossover'], exportTiers: [], ext: ['ari', 'arx'],
    note: 'Decode via ARRI SDK (free, native). Impossible in-browser.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────────────────────
export const AUDIO: CodecEntry[] = [
  {
    id: 'pcm', label: 'PCM (WAV / BWF / AIFF / CAF / RF64)', kind: A, license: 'free',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'wasm', 'crossover'],
    ext: ['wav', 'bwf', 'aif', 'aiff', 'caf', 'rf64', 'w64'], encoder: 'pcm_s24le',
    note: 'All bit depths free. Web Audio can already write WAV in-browser (16/24/32/float).',
  },
  {
    id: 'flac', label: 'FLAC (lossless)', kind: A, license: 'free',
    importTiers: ['native', 'wasm'], exportTiers: ['wasm', 'crossover'], ext: ['flac'], encoder: 'flac',
    note: 'Royalty-free lossless.',
  },
  {
    id: 'alac', label: 'ALAC (Apple Lossless)', kind: A, license: 'free',
    importTiers: ['native', 'wasm'], exportTiers: ['wasm', 'crossover'], ext: ['m4a', 'caf'], encoder: 'alac',
    note: 'Apache-2.0 since 2011 — free.',
  },
  {
    id: 'opus', label: 'Opus', kind: A, license: 'free',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'wasm', 'crossover'],
    ext: ['opus', 'ogg', 'webm'], encoder: 'libopus', note: 'Royalty-free.',
  },
  {
    id: 'vorbis', label: 'Vorbis', kind: A, license: 'free',
    importTiers: ['native', 'wasm'], exportTiers: ['wasm', 'crossover'], ext: ['ogg', 'oga'], encoder: 'libvorbis',
  },
  {
    id: 'aac', label: 'AAC-LC', kind: A, license: 'vendor',
    importTiers: ['native', 'webcodecs', 'wasm'], exportTiers: ['webcodecs', 'crossover'],
    ext: ['m4a', 'aac', 'mp4', 'mov'], encoder: 'aac',
    note: 'Free via WebCodecs. HE-AAC v1/v2 and xHE-AAC are separately licensed — avoid shipping those encoders.',
  },
  {
    id: 'mp3', label: 'MP3', kind: A, license: 'expired',
    importTiers: ['native', 'wasm'], exportTiers: ['wasm', 'crossover'], ext: ['mp3'], encoder: 'libmp3lame',
    note: 'All patents expired 2017. Free.',
  },
  {
    id: 'mp2', label: 'MP2 (MPEG audio L2)', kind: A, license: 'expired',
    importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'], ext: ['mp2', 'mpa', 'ts'], encoder: 'mp2',
    note: 'Expired. Broadcast partner to MPEG-2 video.',
  },
  {
    id: 'iamf', label: 'IAMF / Eclipsa Audio (immersive)', kind: A, license: 'free',
    importTiers: ['crossover'], exportTiers: ['crossover'], ext: ['iamf', 'mp4'], encoder: 'iamf',
    note: 'AOM royalty-free spatial audio. ffmpeg support still emerging — Crossover tier.',
  },
  // ── PAID: real royalties — DECODE ONLY, never ship the encoder, never use the trademark ──
  {
    id: 'ac3', label: 'Dolby Digital (AC-3)', kind: A, license: 'paid',
    importTiers: ['wasm', 'crossover'], exportTiers: [], ext: ['ac3', 'ts', 'vob'],
    note: 'Decode only. Encoding AC-3/E-AC-3/Atmos owes Dolby per-device/title royalties — never bundle the encoder, never show the Dolby name.',
  },
  {
    id: 'eac3', label: 'Dolby Digital Plus (E-AC-3)', kind: A, license: 'paid',
    importTiers: ['wasm', 'crossover'], exportTiers: [], ext: ['eac3', 'ec3', 'ts'],
    note: 'Decode only — same Dolby royalty wall.',
  },
  {
    id: 'dts', label: 'DTS / DTS:X', kind: A, license: 'paid',
    importTiers: ['crossover'], exportTiers: [], ext: ['dts', 'ts'],
    note: 'Decode only (Xperi royalties). No free encoder.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE / STILLS
// ─────────────────────────────────────────────────────────────────────────────
export const IMAGE: CodecEntry[] = [
  { id: 'png', label: 'PNG', kind: I, license: 'free', importTiers: ['native', 'webcodecs'], exportTiers: ['webcodecs', 'wasm'], ext: ['png'] },
  { id: 'jpg', label: 'JPEG', kind: I, license: 'free', importTiers: ['native', 'webcodecs'], exportTiers: ['webcodecs', 'wasm'], ext: ['jpg', 'jpeg'] },
  { id: 'webp', label: 'WebP', kind: I, license: 'free', importTiers: ['native', 'webcodecs'], exportTiers: ['webcodecs', 'wasm'], ext: ['webp'] },
  { id: 'avif', label: 'AVIF', kind: I, license: 'free', importTiers: ['native', 'wasm'], exportTiers: ['wasm', 'crossover'], ext: ['avif'], note: 'AV1-based, royalty-free.' },
  { id: 'exr', label: 'OpenEXR (HDR)', kind: I, license: 'free', importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'], ext: ['exr'], note: '32-bit float HDR. Free.' },
  { id: 'dpx', label: 'DPX', kind: I, license: 'free', importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'], ext: ['dpx'], note: 'Film DI. Free.' },
  { id: 'tiff', label: 'TIFF', kind: I, license: 'free', importTiers: ['wasm', 'crossover'], exportTiers: ['wasm', 'crossover'], ext: ['tif', 'tiff'] },
  { id: 'heic', label: 'HEIC / HEIF', kind: I, license: 'vendor', importTiers: ['native', 'crossover'], exportTiers: ['crossover'], ext: ['heic', 'heif'], note: 'HEVC-based — decode where the OS/libheif provides it; encoding inherits the HEVC wall.' },
];

export const ALL: CodecEntry[] = [...VIDEO, ...AUDIO, ...IMAGE];

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────
const BY_EXT: Map<string, CodecEntry[]> = (() => {
  const m = new Map<string, CodecEntry[]>();
  for (const c of ALL) for (const e of c.ext) {
    const list = m.get(e) || [];
    list.push(c);
    m.set(e, list);
  }
  return m;
})();

export function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Every codec that can ride in this file extension (first = most likely). */
export function codecsForExt(name: string): CodecEntry[] {
  return BY_EXT.get(extOf(name)) || [];
}

export function codecById(id: string): CodecEntry | undefined {
  return ALL.find((c) => c.id === id);
}

/** Can we import this file at all? (any codec on the ext has an import tier) */
export function canImport(name: string): boolean {
  return codecsForExt(name).some((c) => c.importTiers.length > 0);
}

/** Extensions we can import — for building an <input accept="…"> string. */
export function importableExtensions(): string[] {
  const set = new Set<string>();
  for (const c of ALL) if (c.importTiers.length) for (const e of c.ext) set.add('.' + e);
  return [...set].sort();
}

/** The single accept string for the media file picker (free-format-comprehensive). */
export function importAccept(): string {
  return ['video/*', 'audio/*', 'image/*', ...importableExtensions()]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(',');
}

/** Codecs we can EXPORT without owing anyone a royalty. Drives the deliver menu. */
export function freeExportCodecs(kind?: MediaKind): CodecEntry[] {
  return ALL.filter((c) =>
    c.exportTiers.length > 0 &&
    c.license !== 'paid' &&
    (kind ? c.kind === kind : true),
  );
}

/** Codecs that would cost a royalty if we shipped the encoder — the honest "paid" list. */
export function paidCodecs(): CodecEntry[] {
  return ALL.filter((c) => c.license === 'paid');
}

/** Grey-zone codecs (import-free, export-with-an-asterisk). */
export function greyCodecs(): CodecEntry[] {
  return ALL.filter((c) => c.license === 'grey');
}

/** MediaKind guess from a filename, matrix-driven (superset of the old EXT_TYPE). */
export function kindOf(name: string): MediaKind | null {
  const hits = codecsForExt(name);
  if (!hits.length) return null;
  // Prefer video > image > audio when an extension is ambiguous (e.g. .ogg, .mxf).
  if (hits.some((c) => c.kind === 'video')) return 'video';
  if (hits.some((c) => c.kind === 'image')) return 'image';
  return 'audio';
}

/** Which engine would actually run an import of this file (first available tier). */
export function importTierFor(name: string): Tier | null {
  const c = codecsForExt(name)[0];
  return c?.importTiers[0] || null;
}

/** Human summary line for the codec-support UI. */
export function licenseSummary(): { free: number; expired: number; vendor: number; grey: number; paid: number } {
  const acc = { free: 0, expired: 0, vendor: 0, grey: 0, paid: 0 };
  for (const c of ALL) acc[c.license]++;
  return acc;
}
