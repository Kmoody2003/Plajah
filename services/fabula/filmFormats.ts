export interface FabulaResPreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const FABULA_ASPECT_RATIOS = [
  '2.39:1',
  '2.35:1',
  '2:1',
  '1.85:1',
  '1.66:1',
  '16:9',
  '4:3',
  '1:1',
  '9:16',
] as const;

export const FABULA_RES_PRESETS: FabulaResPreset[] = [
  { id: 'sd-ntsc', label: 'SD NTSC', w: 720, h: 480 },
  { id: 'sd-pal', label: 'SD PAL', w: 720, h: 576 },
  { id: 'hd720', label: 'HD 720p', w: 1280, h: 720 },
  { id: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080 },
  { id: '2k-dci', label: '2K DCI', w: 2048, h: 1080 },
  { id: 'uhd4k', label: 'UHD 4K', w: 3840, h: 2160 },
  { id: 'dci4k', label: 'DCI 4K', w: 4096, h: 2160 },
  { id: 'custom', label: 'CUSTOM', w: 0, h: 0 },
];

export interface FabulaFilmPresetEntry {
  id: string;
  label: string;
  w: number;
  h: number;
  aspect: string;
  source: 'resolution' | 'aspect';
}

export function buildFabulaFilmPresets(): FabulaFilmPresetEntry[] {
  const out: FabulaFilmPresetEntry[] = FABULA_RES_PRESETS.filter(p => p.w > 0 && p.h > 0).map(p => ({
    id: `FILM_${p.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
    label: `${p.label} (${p.w}×${p.h})`,
    w: p.w,
    h: p.h,
    aspect: `${p.w}:${p.h}`,
    source: 'resolution' as const,
  }));

  const aspectSpecs: Record<string, { label: string; w: number; h: number }> = {
    '2.39:1': { label: 'CinemaScope 2.39:1 (4K Scope)', w: 4096, h: 1716 },
    '2.35:1': { label: 'Anamorphic 2.35:1 (2K)', w: 2048, h: 871 },
    '2:1': { label: 'Univisium 2:1 (2000×1000)', w: 2000, h: 1000 },
    '1.85:1': { label: 'DCI Flat 1.85:1 (1998×1080)', w: 1998, h: 1080 },
    '1.66:1': { label: 'European Widescreen 1.66:1', w: 1792, h: 1080 },
    '16:9': { label: 'Widescreen 16:9 (1920×1080)', w: 1920, h: 1080 },
    '4:3': { label: 'Academy / TV 4:3 (1440×1080)', w: 1440, h: 1080 },
    '1:1': { label: 'Square Film 1:1 (1080×1080)', w: 1080, h: 1080 },
    '9:16': { label: 'Vertical Reel / Story 9:16 (1080×1920)', w: 1080, h: 1920 },
  };

  for (const ratio of FABULA_ASPECT_RATIOS) {
    const spec = aspectSpecs[ratio];
    if (!spec) continue;
    out.push({
      id: `FILM_AR_${ratio.replace(/[^A-Z0-9]+/gi, '_')}`,
      label: spec.label,
      w: spec.w,
      h: spec.h,
      aspect: ratio,
      source: 'aspect',
    });
  }
  return out;
}
