import { getPlatformInfo } from '../hooks/usePlatform';

/**
 * One HLS configuration, tuned per device class.
 *
 * Reello and Taleo each configured hls.js separately with numbers chosen for a desktop, and the
 * television paid for it: stuttery playback on a 2 GB box whose GPU is an entry-level Mali. The
 * two things that actually hurt there are MEMORY and DECODED PIXELS, in that order — not
 * bandwidth, which is what most default tuning optimises for.
 *
 * Measured device context (docs/TV_GPU_BENCHMARK.md): Mali-G31, 2 GB RAM with roughly 360 MB
 * free, 4 cores, 1080p panel. A 60 MB forward buffer plus an unbounded back buffer is a large
 * fraction of what is free, and memory pressure on Android shows up as GC pauses and evicted
 * decoder buffers — which is exactly what a viewer reads as stutter.
 */

export interface HlsTuning {
  enableWorker: boolean;
  lowLatencyMode: boolean;
  maxBufferLength: number;
  maxMaxBufferLength: number;
  maxBufferSize: number;
  backBufferLength: number;
  startLevel: number;
  abrEwmaDefaultEstimate: number;
  abrBandWidthFactor: number;
  abrBandWidthUpFactor: number;
  maxStarvationDelay: number;
  capLevelOnFPSDrop: boolean;
  fpsDroppedMonitoringPeriod: number;
  fpsDroppedMonitoringThreshold: number;
  nudgeMaxRetry: number;
  fragLoadingMaxRetry: number;
  manifestLoadingMaxRetry: number;
  levelLoadingMaxRetry: number;
}

/**
 * @param retries  Per-surface retry policy. Taleo deliberately fails fast on its Mux attempt so
 *                 it can fall back to another source, so it passes its own numbers.
 */
export function hlsTuning(retries?: Partial<Pick<HlsTuning,
  'fragLoadingMaxRetry' | 'manifestLoadingMaxRetry' | 'levelLoadingMaxRetry'>>): HlsTuning {
  const isTv = getPlatformInfo().isTV;

  const base: HlsTuning = {
    // Parsing off the main thread matters more on a 4-core TV than on a desktop: the main
    // thread is already carrying React, the D-pad layer and the compositor.
    enableWorker: true,
    // Everything here is VOD. Low-latency mode adds partial-segment machinery that buys nothing
    // and costs scheduling.
    lowLatencyMode: false,

    maxBufferLength: isTv ? 20 : 30,
    maxMaxBufferLength: isTv ? 40 : 60,
    // The single most important number on the television. 60 MB of forward buffer on a box with
    // ~360 MB free leaves nothing for the decoder.
    maxBufferSize: (isTv ? 24 : 60) * 1000 * 1000,
    // Release what has already been watched. hls.js defaults this to Infinity, so a long film
    // grows its back buffer for its entire runtime — Taleo set no value at all, which is why a
    // feature-length title degraded the further in you got.
    backBufferLength: isTv ? 15 : 30,

    startLevel: -1,
    // Start conservative and climb slowly. A TV on wifi that overshoots its bitrate does not
    // degrade gracefully — it rebuffers, and rebuffering mid-scene is far worse than one rung
    // of picture quality.
    abrEwmaDefaultEstimate: isTv ? 800_000 : 1_000_000,
    abrBandWidthFactor: isTv ? 0.8 : 0.95,
    abrBandWidthUpFactor: isTv ? 0.6 : 0.7,
    maxStarvationDelay: isTv ? 4 : 4,

    // Bandwidth ABR cannot see an underpowered decoder. A stream can download comfortably
    // while the device still drops frames trying to decode its largest rendition (especially
    // a UHD master on an Android/TV GPU). Let hls.js detect that condition and lower the
    // automatic quality ceiling until playback is smooth again.
    capLevelOnFPSDrop: true,
    fpsDroppedMonitoringPeriod: isTv ? 3_000 : 5_000,
    fpsDroppedMonitoringThreshold: isTv ? 0.15 : 0.2,

    nudgeMaxRetry: 5,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 3,
    levelLoadingMaxRetry: 3,
  };

  return { ...base, ...retries };
}

/**
 * Stop the player decoding more pixels than the panel can show.
 *
 * hls.js ships `capLevelToPlayerSize` for this, and it is the wrong tool HERE: it multiplies the
 * element's CSS size by devicePixelRatio, and this television reports DPR 2 against a 1600x900
 * CSS viewport — so it computes a 3200x1800 "player" and happily authorises a 4K rendition on a
 * 1080p screen. Cap against the physical panel instead.
 *
 * Call once from MANIFEST_PARSED, where the level list is known.
 */
export function capLevelsToPanel(hls: { levels?: Array<{ width?: number; height?: number }>; autoLevelCapping: number }): void {
  try {
    const levels = hls.levels || [];
    if (levels.length < 2) return;

    const isTv = getPlatformInfo().isTV;
    const dpr = isTv ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    // Guard against a lying WebView by never capping below 1280x720 — a too-low cap is a visible
    // quality regression. Checking BOTH width and height matters for 2.20:1 / 2.39:1 widescreen
    // films (e.g. Pumpkin Patch, where 2560x1164 @ 11.7 Mbps has height 1164 but 2.5K width).
    const panelWidth = Math.max(Math.round((window.screen?.width || 1920) * dpr), 1280);
    const panelHeight = Math.max(Math.round((window.screen?.height || 1080) * dpr), 720);

    let capIndex = -1;
    for (let i = 0; i < levels.length; i++) {
      const w = levels[i].width || 0;
      const h = levels[i].height || 0;
      const fitsWidth = !w || w <= panelWidth;
      const fitsHeight = !h || h <= panelHeight;
      if (fitsWidth && fitsHeight) {
        const bestH = capIndex === -1 ? 0 : (levels[capIndex].height || 0);
        const bestW = capIndex === -1 ? 0 : (levels[capIndex].width || 0);
        if (capIndex === -1 || h > bestH || (h === bestH && w > bestW)) {
          capIndex = i;
        }
      }
    }
    // Every rendition exceeds the panel (rare, but possible): take the smallest rather than
    // leaving it uncapped and asking the GPU to decode all of them.
    if (capIndex === -1) {
      capIndex = levels.reduce((best, l, i) => ((l.height || 0) < (levels[best].height || 0) ? i : best), 0);
    }
    hls.autoLevelCapping = capIndex;
  } catch { /* capping is an optimisation — never let it break playback */ }
}

