export type PhotoEditMode = 'basic' | 'advanced' | 'creative';

export interface PhotoEditAdjustments {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  highlights: number;
  shadows: number;
  clarity: number;
  grain: number;
  vignette: number;
  brilliance: number;
  structure: number;
  dehaze: number;
  blacks: number;
  whites: number;
  fade: number;
  rotation: number;
  cropAspect: 'free' | '1:1' | '4:5' | '3:2' | '16:9';
}

export interface PhotoEditRecipe {
  id: string;
  sourcePhotoId?: string;
  mode: PhotoEditMode;
  adjustments: PhotoEditAdjustments;
  masks: { id: string; type: 'subject' | 'sky' | 'brush' | 'linear' | 'radial'; strength: number }[];
  aiTools: { id: string; label: string; deviceOnly: boolean; enabled: boolean }[];
  updatedAt: number;
}

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoEditAdjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  clarity: 0,
  grain: 0,
  vignette: 0,
  brilliance: 0,
  structure: 0,
  dehaze: 0,
  blacks: 0,
  whites: 0,
  fade: 0,
  rotation: 0,
  cropAspect: 'free',
};

/** Shared nondestructive looks used by Photos, Taleo and Fabula renderers. */
export type CreativeLookCategory = 'Essential' | 'Portrait' | 'Cinema' | 'Analog' | 'Landscape';
export const CREATIVE_LOOKS: Array<{ id: string; label: string; category: CreativeLookCategory; accent: string; adjustments: Partial<PhotoEditAdjustments> }> = [
  { id: 'clean', label: 'Clear Day', category: 'Essential', accent: '#d8f3ff', adjustments: { brilliance: 18, shadows: 10, highlights: -8, clarity: 8 } },
  { id: 'soft_light', label: 'Soft Light', category: 'Essential', accent: '#ffe8cb', adjustments: { brilliance: 12, contrast: -8, highlights: -14, shadows: 16 } },
  { id: 'true_color', label: 'True Color', category: 'Essential', accent: '#8fe6ca', adjustments: { saturation: 8, brilliance: 10, clarity: 5 } },
  { id: 'golden_hour', label: 'Amber Hour', category: 'Portrait', accent: '#ff9f43', adjustments: { warmth: 24, tint: 5, highlights: -12, saturation: 9 } },
  { id: 'portrait', label: 'Velvet Skin', category: 'Portrait', accent: '#f5b7c7', adjustments: { brilliance: 14, clarity: -8, shadows: 12, warmth: 6 } },
  { id: 'editorial', label: 'Editorial Rose', category: 'Portrait', accent: '#d886a7', adjustments: { tint: 12, saturation: -5, contrast: 9, fade: 5 } },
  { id: 'cinematic', label: 'Night Passage', category: 'Cinema', accent: '#42b7bd', adjustments: { contrast: 16, saturation: -8, warmth: -7, tint: 5, fade: 8, vignette: 14 } },
  { id: 'dramatic', label: 'Iron Sky', category: 'Cinema', accent: '#687b98', adjustments: { contrast: 28, structure: 24, dehaze: 18, highlights: -24 } },
  { id: 'noir', label: 'Silver Noir', category: 'Cinema', accent: '#b8bec8', adjustments: { saturation: -100, contrast: 30, blacks: -18, grain: 12, vignette: 22 } },
  { id: 'teal_fire', label: 'Teal & Ember', category: 'Cinema', accent: '#00b8a9', adjustments: { warmth: -14, tint: -5, contrast: 20, saturation: 12, dehaze: 9 } },
  { id: 'matte', label: 'Paper Matte', category: 'Analog', accent: '#d8b98a', adjustments: { contrast: -6, fade: 24, saturation: -5, grain: 8 } },
  { id: 'kodachrome', label: 'Road Chrome', category: 'Analog', accent: '#e94d35', adjustments: { contrast: 18, saturation: 17, warmth: 8, grain: 15, shadows: -8 } },
  { id: 'instant', label: 'Instant Memory', category: 'Analog', accent: '#f1d7ad', adjustments: { fade: 18, warmth: 13, saturation: -9, grain: 18, vignette: 8 } },
  { id: 'cyanotype', label: 'Blueprint Sun', category: 'Analog', accent: '#2176ae', adjustments: { saturation: -42, warmth: -36, tint: -8, contrast: 18, grain: 10 } },
  { id: 'alpine', label: 'Alpine Air', category: 'Landscape', accent: '#79d6e8', adjustments: { dehaze: 22, structure: 18, saturation: 8, highlights: -20, shadows: 12 } },
  { id: 'forest', label: 'Deep Canopy', category: 'Landscape', accent: '#4c956c', adjustments: { tint: -14, warmth: 5, dehaze: 14, blacks: -10, saturation: 13 } },
  { id: 'desert', label: 'Desert Bloom', category: 'Landscape', accent: '#e9a65a', adjustments: { warmth: 21, brilliance: 12, highlights: -16, structure: 10, saturation: 7 } },
  { id: 'storm', label: 'Storm Glass', category: 'Landscape', accent: '#778da9', adjustments: { warmth: -12, dehaze: 30, contrast: 22, highlights: -30, vignette: 13 } },
];

export function applyCreativeLook(current: PhotoEditAdjustments, lookId: string): PhotoEditAdjustments {
  const look = CREATIVE_LOOKS.find((item) => item.id === lookId);
  return look ? { ...current, ...look.adjustments } : current;
}

/** Compile the shared develop recipe to Fabula/Pixels host-neutral GPU effects.
 * These instances are used unchanged for still preview, video preview and export. */
export function photoAdjustmentsToEffects(a: PhotoEditAdjustments) {
  return [
    { id: 'photo-develop-tone', effectId: 'developtone', enabled: true, mix: 1, params: {
      exposure: a.exposure, contrast: a.contrast, highlights: a.highlights, shadows: a.shadows,
      whites: a.whites, blacks: a.blacks, warmth: a.warmth, tint: a.tint,
    } },
    { id: 'photo-develop-finish', effectId: 'developfinish', enabled: true, mix: 1, params: {
      saturation: a.saturation, brilliance: a.brilliance, clarity: a.clarity,
      structure: a.structure, dehaze: a.dehaze, fade: a.fade, vignette: a.vignette, grain: a.grain,
    } },
  ];
}

export const PHOTO_IMPORT_SOURCES = [
  { id: 'google_photos', label: 'Google Photos', status: 'planned', note: 'OAuth library import, albums, favorites, and device camera backups.' },
  { id: 'google_drive', label: 'Google Drive', status: 'planned', note: 'Folder picker for RAW/JPEG exports and shared drives.' },
  { id: 'onedrive', label: 'Microsoft OneDrive', status: 'planned', note: 'Personal and business library imports.' },
  { id: 'lightroom', label: 'Adobe Lightroom', status: 'planned', note: 'Album import and rendered edit previews through Adobe-connected workflows.' },
  { id: 'capture_one', label: 'Capture One', status: 'planned', note: 'Session/catalog handoff for pro photographers.' },
];

export const PHOTOGRAPHER_PRO_FEATURES = [
  'Public/private portfolio rooms with optional EXIF, lens, location, and rights metadata.',
  'Music-backed showcases using on-platform artists and licensed tracks.',
  'Event photo pools with QR entry, short clips, live chat, artist management, and live-event hub links.',
  'Non-destructive edit recipes that preserve originals and can be revised or removed at any time.',
  'Future blockchain utility for provenance, limited editions, licenses, collector access, and usage receipts.',
];

export function createPhotoEditRecipe(sourcePhotoId?: string, mode: PhotoEditMode = 'basic'): PhotoEditRecipe {
  return {
    id: `recipe_${sourcePhotoId || 'draft'}_${Date.now()}`,
    sourcePhotoId,
    mode,
    adjustments: { ...DEFAULT_PHOTO_ADJUSTMENTS },
    masks: [],
    aiTools: [
      { id: 'auto_tone', label: 'Auto Tone', deviceOnly: true, enabled: false },
      { id: 'subject_lift', label: 'Subject Lift', deviceOnly: true, enabled: false },
      { id: 'background_clean', label: 'Background Clean', deviceOnly: true, enabled: false },
    ],
    updatedAt: Date.now(),
  };
}

export function adjustmentToCssFilter(adjustments: PhotoEditAdjustments) {
  const brightness = 1 + (adjustments.exposure + adjustments.brilliance * .35 + adjustments.whites * .18 + adjustments.shadows * .12 - adjustments.blacks * .1 - adjustments.highlights * .06) / 100;
  const contrast = 1 + (adjustments.contrast + adjustments.structure * .35 + adjustments.clarity * .22 + adjustments.dehaze * .4 + adjustments.blacks * .12 - adjustments.fade * .3 - adjustments.shadows * .06) / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const warmthHue = adjustments.warmth * 0.08 + adjustments.tint * 0.04;
  const sepia = Math.max(0, adjustments.warmth) / 500;
  return `brightness(${Math.max(.05, brightness)}) contrast(${Math.max(.05, contrast)}) saturate(${Math.max(0, saturation)}) sepia(${sepia}) hue-rotate(${warmthHue}deg)`;
}
