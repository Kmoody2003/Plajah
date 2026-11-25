/**
 * Custom-background controls.
 *
 * A person's uploaded picture / video sits at the bottom of the page (#universal-background in
 * App.tsx). Whether it is actually *visible* depends on a stack of layers above it — blur on the
 * media itself, a frost veil, the theme's own gradient, the readability scrim, and the interface
 * panels. They used to be fixed (40px blur + 100px backdrop blur + 30% black + a second 28px blur
 * from the scrim), which turned any photo into a smudge. Every one of them is a control now.
 */
import type { UserProfile } from '../types';

export type BgSource = 'auto' | 'image' | 'video';

export interface BgControls {
  /** Which upload shows when both a still and a video exist. */
  source: BgSource;
  /** How much of the THEME'S own gradient is laid over the media (0 = media only). */
  themeOpacity: number;
  /** How the theme gradient blends into the media. */
  blend: string;
  /** Blur on the media itself, in px. */
  blurPx: number;
  /** Frost veil strength (backdrop blur + a touch of black), 0–100. */
  frostPct: number;
  /** Readability veil between the background and the interface, 0–100. */
  veilPct: number;
  /** Opacity of the interface panels over the background, 20–100. */
  uiPct: number;
}

export const BLEND_MODES: { id: string; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'soft-light', label: 'Soft light' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'hard-light', label: 'Hard light' },
  { id: 'color', label: 'Colour' },
  { id: 'luminosity', label: 'Luminosity' },
];

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
};

export function resolveBgControls(p?: Partial<UserProfile> | null): BgControls {
  const legacyBlurOff = p?.videoBackgroundBlur === false;
  const legacyFrostOff = p?.videoBackgroundFrosted === false;
  const src = p?.bgSource;
  return {
    source: src === 'image' || src === 'video' ? src : 'auto',
    themeOpacity: clamp(p?.bgThemeOpacity, 0, 100, 0),
    blend: BLEND_MODES.some(b => b.id === p?.bgBlend) ? (p!.bgBlend as string) : 'normal',
    // Softer defaults than the old fixed 40px: the picture should read as a picture.
    blurPx: clamp(p?.bgBlurPx, 0, 60, legacyBlurOff ? 0 : 12),
    frostPct: clamp(p?.bgFrostPct, 0, 100, legacyFrostOff ? 0 : 10),
    veilPct: clamp(p?.bgVeilPct, 0, 100, 55),
    uiPct: clamp(p?.bgUiAlphaPct, 20, 100, 100),
  };
}
