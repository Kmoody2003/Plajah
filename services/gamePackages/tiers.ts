// Delivery tiers (docs/GAME_DELIVERY_ARCHITECTURE.md §2): every game picks one of three presets at start.
//   web            the browser build, as close to console quality as the GPU allows (no package)
//   native-pc      the WinUI app with the game's HQ package installed: 2k+ surfaces, hi-res cast, full effects
//   native-mobile  the Android app with the HQ package: package assets, mobile-sized effects and frame target
// The app WITHOUT a package plays the web tier (it still gets the app's higher default quality on a discrete GPU).

import type { PackageTier } from './manifest';

export type DeliveryTier = 'web' | PackageTier;
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface TierEnv {
  /** tier of the installed HQ package for this game, if the app has one */
  packageTier?: PackageTier | null;
  isMobile: boolean;
  isTv: boolean;
  /** integrated / low-power GPU (Intel, Qualcomm, Apple, Arm) */
  integrated: boolean;
  /** running inside the Plajah WinUI app (WebView2) */
  inDesktopApp: boolean;
  /** ?q= override */
  q?: string | null;
}

export interface TierChoice {
  tier: DeliveryTier;
  quality: Quality;
  textures: '1k' | '2k';
  /** ms per frame the dynamic resolution aims for */
  frameTargetMs: number;
}

const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];

export function pickTier(env: TierEnv): TierChoice {
  const slow = env.isMobile || env.isTv;
  let tier: DeliveryTier = 'web';
  // a package is only used on the platform it was built for: a PC package never drives a phone and vice versa
  if (env.packageTier === 'native-pc' && env.inDesktopApp && !slow) tier = 'native-pc';
  else if (env.packageTier === 'native-mobile' && env.isMobile) tier = 'native-mobile';

  let quality: Quality =
    tier === 'native-pc' ? (env.integrated ? 'high' : 'ultra')
      : tier === 'native-mobile' ? 'medium'
        : slow ? 'low' : env.inDesktopApp ? 'ultra' : env.integrated ? 'medium' : 'high';
  if (env.q && (QUALITIES as string[]).includes(env.q)) quality = env.q as Quality;

  // The HQ surfaces are in the package; the web deployment ships the 1k set (a 2k request falls back to 1k per file).
  const textures = tier !== 'web' || quality === 'high' || quality === 'ultra' ? '2k' : '1k';
  return { tier, quality, textures, frameTargetMs: slow ? 33.3 : 16.7 };
}
