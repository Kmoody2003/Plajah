export type PhotoEditMode = 'basic' | 'advanced';

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
  rotation: 0,
  cropAspect: 'free',
};

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
  const brightness = 1 + adjustments.exposure / 100;
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const warmthHue = adjustments.warmth * 0.08 + adjustments.tint * 0.04;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${warmthHue}deg)`;
}
