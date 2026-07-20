// tvCapabilities.ts — what Plajah does NOT do on a television, and how it says so.
//
// A TV is a lean-back device: no keyboard worth typing on, no file picker worth browsing, no
// camera, and a CPU/GPU budget that has to go to playback. Several features are therefore
// switched off rather than shipped in a degraded state.
//
// The rule is that a disabled feature must SAY it is disabled. Silently hiding a button reads
// as a broken app on a screen the viewer can't inspect; a one-line explanation reads as a
// deliberate product decision, which it is.

import { getPlatformInfo } from '../hooks/usePlatform';
import { getPerfTier, shouldEnableEffect } from './tvPerformance';

export type TvDisabledFeature =
  | 'upload'            // no file picker, no files worth picking
  | 'creatorStudio'     // Fabula / Pixels / TV Studio — mouse-and-keyboard tools
  | 'transcode'         // hand a TV SoC a background encode and playback stutters
  | 'audioAnalysis'     // waveform/beat precompute: decodes whole files, all CPU
  | 'stemSeparation'    // minutes of saturated CPU; nothing on a TV can afford it
  | 'camera'            // VTuber / live / video calls
  | 'documentEditing'   // Lorea authoring, screenplay editing — heavy text entry
  | 'fileConversion'    // Crossover — a desktop job
  | 'breakdown'         // transcription/notation compute — heavy DSP on the main thread
  | 'liveStream';       // broadcasting — a TV has no camera and no way to run a show

/** Why each feature is off, in the viewer's language. Shown verbatim in the UI, so these are
 *  written as explanations rather than error messages — nothing here is a failure. */
const REASONS: Record<TvDisabledFeature, string> = {
  upload:          'Uploading works from your phone or computer — your library appears here automatically.',
  creatorStudio:   'The creator studios need a mouse and keyboard. Open Plajah on a computer to edit.',
  transcode:       'Audio processing is skipped on TV so playback stays smooth.',
  audioAnalysis:   'Track analysis runs on your phone or computer, then syncs here.',
  stemSeparation:  'Stem separation needs more processing power than a TV has. Try it on a computer.',
  camera:          'Camera features are unavailable on TV.',
  documentEditing: 'Writing and editing work best with a keyboard. Open Plajah on a computer.',
  fileConversion:  'File conversion is a desktop feature.',
  breakdown:       'Analysis runs on your phone or computer. Scores you’ve already saved still play here.',
  liveStream:      'Go live from your phone or computer. You can watch live streams here.',
};

/**
 * Is this feature available here?
 *
 * `transcode` and `audioAnalysis` are additionally disabled on any low-tier device, TV or not:
 * the objection is the CPU budget, and a struggling phone has the same problem a cheap TV does.
 */
export function isFeatureAvailable(feature: TvDisabledFeature): boolean {
  const { isTV } = getPlatformInfo();
  if (isTV) return false;
  if ((feature === 'transcode' || feature === 'audioAnalysis' || feature === 'breakdown') && getPerfTier() === 'low') return false;
  return true;
}

/** The sentence to show when a feature is unavailable, or null when it is available. */
export function unavailableReason(feature: TvDisabledFeature): string | null {
  return isFeatureAvailable(feature) ? null : REASONS[feature];
}

/**
 * Guard a background job. Returns true when the caller should skip the work.
 *
 * Deliberately silent — background tasks have no UI to explain themselves, and the disclaimer
 * belongs on the feature the viewer actually tried to use, not in a console nobody reads on a
 * TV. Kept separate from `isFeatureAvailable` so the two intents don't get confused at call
 * sites: this one is "don't do the work", that one is "tell the viewer why".
 */
export function skipOnTV(feature: TvDisabledFeature): boolean {
  return !isFeatureAvailable(feature);
}

/**
 * Should the ambient visuals be a slideshow rather than a live visualizer?
 *
 * A visualizer is a per-frame canvas driven by an audio analyser — continuous GPU work for as
 * long as the music plays. A slideshow is a crossfade every few seconds. On a TV stick, or any
 * device without the GPU headroom, the visualizer is the thing that makes the whole UI choppy,
 * so those devices get the slideshow instead. It is not a downgrade so much as the right
 * ambient visual for the hardware: still something to look at, at a fraction of the cost.
 */
export function preferSlideshowOverVisualizer(): boolean {
  return !shouldEnableEffect('visualizer');
}

/**
 * Can this device compute a track breakdown (transcription, stem analysis, notation)?
 *
 * All of it is heavy DSP on the main thread. A TV has no budget for it while also decoding
 * audio, and the result would be a stuttering player. Saved notation can still be DISPLAYED —
 * see `canReplaySavedNotation` — because rendering an existing score costs nothing.
 */
export function canComputeBreakdown(): boolean {
  return !getPlatformInfo().isTV && getPerfTier() !== 'low';
}

/** Showing an already-computed score is just drawing. Always allowed. */
export function canReplaySavedNotation(): boolean {
  return true;
}

/** A TV is for consumption, not creation. These are the two questions the UI asks most, so
 *  they get names rather than being re-derived from `isFeatureAvailable` at every button. */
export const canUpload = (): boolean => isFeatureAvailable('upload');
export const canGoLive = (): boolean => isFeatureAvailable('liveStream');

// ─── What a television actually shows ────────────────────────────────────────
//
// A TV is a streaming appliance, not a platform browser. Everything outside this list is
// either uncontrollable with a remote, pointless on a 10-foot screen, or too expensive to
// keep resident — and on a 2GB TV with a 192MB per-app heap, "not loaded" is a feature.

/** The only destinations reachable on a TV, in the order they should appear. */
export const TV_NAV_VIEWS = ['MOVIES_TV', 'MUSIC', 'VIDEOS', 'GLOBAL_PHOTOS', 'USER_PROFILE'] as const;

/** Where a television opens. Taleo behaves like a streaming service, so it leads. */
export type TvHomeView = 'MOVIES_TV' | 'MUSIC' | 'VIDEOS';
const TV_HOME_KEY = 'plajah:tvHome';

export function getTvHome(): TvHomeView {
  try {
    const v = localStorage.getItem(TV_HOME_KEY);
    if (v === 'MUSIC' || v === 'VIDEOS' || v === 'MOVIES_TV') return v;
  } catch { /* private mode */ }
  return 'MOVIES_TV';
}

export function setTvHome(v: TvHomeView): void {
  try { localStorage.setItem(TV_HOME_KEY, v); } catch { /* private mode */ }
}

/** Is this destination reachable on this device? Non-TV devices keep everything. */
export function isViewAllowedOnTv(view: string): boolean {
  if (!getPlatformInfo().isTV) return true;
  return (TV_NAV_VIEWS as readonly string[]).includes(view);
}

/** Themes are a desktop personalisation. A TV gets one high-contrast look built for
 *  distance viewing, and skipping the alternates avoids loading their assets at all. */
export const themesAllowed = (): boolean => !getPlatformInfo().isTV;
