import { useState } from 'react';

export type PlatformType = 'web' | 'android' | 'ios' | 'firetv' | 'tizen' | 'roku' | 'alexa';
export type ScreenClass = 'phone' | 'tablet' | 'desktop' | 'tv';

export interface PlatformInfo {
  type: PlatformType;
  isTV: boolean;
  isMobile: boolean;
  isNative: boolean;
  hasTouch: boolean;
  hasDpad: boolean;
  hasVoice: boolean;
  screenClass: ScreenClass;
  /** Apply this as a body className to activate the correct CSS theme */
  themeClass: 'theme-phone' | 'theme-big-screen' | '';
  /** Which detection tier(s) fired. Diagnostic only — inspect via getPlatformInfo(). */
  tvSignals: Record<string, boolean>;
}

/** Force TV mode off-device: `?tv=1` in the URL, or localStorage `plajah:tvnav='1'`.
 *  The only way to review the TV experience without a TV; never true on a real device
 *  unless someone deliberately set it. */
function forcedTV(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('tv') === '1') return true;
    return localStorage.getItem('plajah:tvnav') === '1';
  } catch { return false; }
}

function detect(): PlatformInfo {
  const ua = navigator.userAgent.toLowerCase();
  const cap = (window as any).Capacitor;

  const isCapacitor = cap?.isNativePlatform?.() === true;
  const isAndroid = ua.includes('android');
  const isIOS = /iphone|ipad|ipod/.test(ua);

  // FireTV user-agents include 'silk', 'aftt' (Fire TV Stick 4K), or 'kfapwi'
  const isFireTV =
    ua.includes('silk') ||
    ua.includes('aftt') ||
    ua.includes('kfapwi') ||
    ua.includes('aftmm') ||
    document.getElementById('__firetv__') !== null;

  // Samsung Tizen (Smart TV)
  const isTizen = ua.includes('tizen') || !!(window as any).tizen;

  // Roku
  const isRoku = ua.includes('roku') || !!(window as any).Roku;

  // Alexa (Echo Show built-in browser, or Alexa Presentation Language webview)
  const isAlexa =
    ua.includes('alexa') ||
    ua.includes('echo') ||
    !!(window as any).Alexa;

  // ── TIER 1: the OS's own verdict ────────────────────────────────────────────
  // MainActivity appends `PlajahTV/1` to the WebView UA when Android reports
  // UI_MODE_TYPE_TELEVISION or FEATURE_LEANBACK. That is the only *authoritative* signal
  // available — everything below it is inference. Present only in the native TV app.
  const isNativeTV = ua.includes('plajahtv/1');

  // ── TIER 2: platform + OEM tokens ───────────────────────────────────────────
  // Android TV / Google TV incl. TCL, Sony Bravia, Sharp Aquos, Xiaomi Mi Box,
  // Chromecast-with-Google-TV, Nvidia Shield, and the Android Studio TV emulator.
  const hasTvToken =
    /google\s?tv|android\s?tv|smart-?tv|smarttv|leanback|\btv\b|bravia|aquos|\btcl\b|mibox|chromecast|sabrina|adt-3|shield|philips|hisense|vidaa|netcast|webos|hbbtv/.test(ua);

  // ── TIER 3: input + display shape ───────────────────────────────────────────
  // A leanback device has no touchscreen and no hover-capable pointer. Phones and tablets
  // always report maxTouchPoints > 0; desktops report a fine, hoverable pointer. A device
  // with neither, on a big screen, is a TV. `screen.width` alone is useless here — TV
  // WebViews are density-scaled well below 1920.
  const noTouch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints === 0;
  const noHover = matchMedia?.('(hover: none) and (pointer: coarse)').matches
    || matchMedia?.('(pointer: none)').matches
    || false;
  const bigScreen = window.screen.width >= 1280;
  const looksLeanback = isAndroid && noTouch && (noHover || bigScreen);

  const isForced = forcedTV();
  const isTV =
    isForced ||                                     // explicit override (TV-sim / testing)
    isNativeTV ||                                   // tier 1 — trusted outright
    isFireTV || isTizen || isRoku ||                // dedicated TV platforms
    (isAndroid && hasTvToken) ||                    // tier 2
    looksLeanback;                                  // tier 3

  // Kept so a real device can be debugged from the console (`getPlatformInfo().tvSignals`)
  // instead of guessing which tier fired — the previous detection was opaque when it failed.
  const tvSignals = { forced: isForced, native: isNativeTV, firetv: isFireTV, tizen: isTizen, roku: isRoku, uaToken: isAndroid && hasTvToken, leanbackShape: looksLeanback, noTouch, noHover };

  let type: PlatformType = 'web';
  if (isFireTV) type = 'firetv';
  else if (isTizen) type = 'tizen';
  else if (isRoku) type = 'roku';
  else if (isAlexa) type = 'alexa';
  else if (isCapacitor && isAndroid) type = 'android';
  else if (isCapacitor && isIOS) type = 'ios';

  // TV always wins. This ordering is the whole bug that shipped: App.tsx tested "is mobile"
  // first, that test matched /Android/i, and every Android TV took the phone branch before the
  // TV check was ever reached.
  const isMobile = !isTV && (isCapacitor || /mobi|android|tablet|ipad|iphone/.test(ua));
  const hasTouch = !isTV && navigator.maxTouchPoints > 0;
  const hasDpad = isTV;
  const hasVoice = isAlexa || isTV; // TV remotes have voice buttons too

  const w = window.screen.width;
  let screenClass: ScreenClass = 'desktop';
  if (isTV) screenClass = 'tv';
  else if (w < 768) screenClass = 'phone';
  else if (w < 1200) screenClass = 'tablet';

  const themeClass =
    screenClass === 'tv' ? 'theme-big-screen' :
    screenClass === 'phone' ? 'theme-phone' :
    '';

  return {
    type,
    isTV,
    isMobile,
    isNative: isCapacitor,
    hasTouch,
    hasDpad,
    hasVoice,
    screenClass,
    themeClass,
    tvSignals,
  };
}

let cached: PlatformInfo | null = null;
const getPlatform = (): PlatformInfo => {
  if (!cached) cached = detect();
  return cached;
};

/** Returns stable platform info (computed once, never re-renders). */
export const usePlatform = (): PlatformInfo => {
  const [info] = useState<PlatformInfo>(getPlatform);
  return info;
};

/** Synchronous accessor for use outside React (e.g., in services). */
export const getPlatformInfo = getPlatform;
