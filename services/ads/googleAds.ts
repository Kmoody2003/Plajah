/**
 * Browser side of network ads: loads Google's tags only when a surface actually needs one, and never
 * for a restricted viewer (see networkAds.adAudienceFor). Nothing here is loaded at app start.
 *
 *   GPT  (Google Publisher Tag)  → display ads in the side ad panel   components/ads/NetworkAdSlot
 *   IMA  (Interactive Media Ads) → VAST video/audio in TV breaks + FM  components/ads/VastAdPlayer
 *
 * Consent: Google's own consent message (Ad Manager → Privacy & messaging) is served by GPT/IMA
 * themselves once it's switched on in the Ad Manager account, so EU/UK visitors are asked by Google.
 */
import { AD_AUDIENCE_STORAGE_KEY, normalizeAdNetwork, type AdAudience, type AdNetworkConfig } from './networkAds';

const loaded = new Map<string, Promise<void>>();

export function loadScriptOnce(src: string): Promise<void> {
  const hit = loaded.get(src);
  if (hit) return hit;
  const p = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loaded.delete(src); reject(new Error(`failed to load ${src}`)); };
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

// ── Config (one fetch per page load) ─────────────────────────────────────────

export interface AdNetworkState { config: AdNetworkConfig; thirdPartyPct: number }

let configPromise: Promise<AdNetworkState> | null = null;

/** GET /api/ads/network: the public part of the admin's setup. Off on any failure. */
export function fetchAdNetwork(): Promise<AdNetworkState> {
  if (!configPromise) {
    configPromise = fetch('/api/ads/network', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: any) => ({ config: normalizeAdNetwork(j?.config), thirdPartyPct: Number(j?.thirdPartyPct) || 0 }))
      .catch(() => ({ config: normalizeAdNetwork(null), thirdPartyPct: 0 }));
  }
  return configPromise;
}

/** Let the next fetchAdNetwork() read fresh settings (after the admin saves). */
export function resetAdNetworkCache(): void { configPromise = null; }

/** Shared with same-origin pages (the web games read it in public/games/shared/plajah-game-ads.js). */
export function publishAdAudience(a: AdAudience): void {
  try { localStorage.setItem(AD_AUDIENCE_STORAGE_KEY, a); } catch { /* storage off: games then use their default */ }
}

// ── GPT ──────────────────────────────────────────────────────────────────────

export const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
let gptReady: Promise<any> | null = null;

export function loadGpt(): Promise<any> {
  if (!gptReady) {
    const w = window as any;
    w.googletag = w.googletag || { cmd: [] };
    gptReady = loadScriptOnce(GPT_SRC).then(() => new Promise(resolve => {
      w.googletag.cmd.push(() => {
        const pubads = w.googletag.pubads();
        pubads.enableSingleRequest?.();
        pubads.collapseEmptyDivs?.(false);
        w.googletag.enableServices();
        resolve(w.googletag);
      });
    }));
    gptReady.catch(() => { gptReady = null; });
  }
  return gptReady;
}

// ── IMA ──────────────────────────────────────────────────────────────────────

export const IMA_SRC = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';

export function loadIma(): Promise<any> {
  return loadScriptOnce(IMA_SRC).then(() => {
    const ima = (window as any).google?.ima;
    if (!ima) throw new Error('IMA unavailable');
    return ima;
  });
}

export type VastOutcome = 'complete' | 'nofill' | 'error' | 'timeout' | 'stopped';

export interface VastPlayback {
  /** Resolves once, however the ad ends. */
  done: Promise<VastOutcome>;
  stop: () => void;
}

/**
 * Request and play one VAST ad into `container` (the ad's own UI goes there) using `video` for media.
 * Gives up if nothing has started within `startTimeoutMs`, and cuts off at `maxSec` regardless.
 */
export function playVast(opts: {
  tagUrl: string;
  container: HTMLElement;
  video: HTMLVideoElement;
  width: number;
  height: number;
  muted?: boolean;
  maxSec?: number;
  startTimeoutMs?: number;
  onStarted?: () => void;
  onClick?: () => void;
}): VastPlayback {
  let settle!: (o: VastOutcome) => void;
  const done = new Promise<VastOutcome>(r => { settle = r; });
  let finished = false;
  let manager: any = null;
  let started = false;
  const timers: number[] = [];
  const end = (o: VastOutcome) => {
    if (finished) return;
    finished = true;
    timers.forEach(t => clearTimeout(t));
    try { manager?.destroy(); } catch { /* */ }
    settle(o);
  };
  timers.push(window.setTimeout(() => { if (!started) end('timeout'); }, opts.startTimeoutMs ?? 7000));

  loadIma().then(ima => {
    if (finished) return;
    const display = new ima.AdDisplayContainer(opts.container, opts.video);
    display.initialize();
    const loader = new ima.AdsLoader(display);
    loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => end('nofill'), false);
    loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e: any) => {
      if (finished) return;
      const settings = new ima.AdsRenderingSettings();
      settings.restoreCustomPlaybackStateOnAdBreakComplete = false;
      manager = e.getAdsManager(opts.video, settings);
      const T = ima.AdEvent.Type;
      manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => end('error'));
      manager.addEventListener(T.ALL_ADS_COMPLETED, () => end('complete'));
      manager.addEventListener(T.SKIPPED, () => end('complete'));
      manager.addEventListener(T.CLICK, () => opts.onClick?.());
      manager.addEventListener(T.STARTED, () => {
        if (started) return;
        started = true;
        opts.onStarted?.();
        if (opts.maxSec) timers.push(window.setTimeout(() => end('complete'), (opts.maxSec + 2) * 1000));
      });
      try {
        manager.init(opts.width, opts.height, ima.ViewMode?.NORMAL);
        manager.setVolume(opts.muted ? 0 : 1);
        manager.start();
      } catch { end('error'); }
    }, false);
    const req = new ima.AdsRequest();
    req.adTagUrl = opts.tagUrl;
    req.linearAdSlotWidth = opts.width;
    req.linearAdSlotHeight = opts.height;
    req.nonLinearAdSlotWidth = opts.width;
    req.nonLinearAdSlotHeight = Math.round(opts.height / 3);
    req.setAdWillAutoPlay?.(true);
    req.setAdWillPlayMuted?.(!!opts.muted);
    loader.requestAds(req);
  }).catch(() => end('error'));

  return { done, stop: () => end('stopped') };
}
