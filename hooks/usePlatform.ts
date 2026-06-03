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

  const isTV = isFireTV || isTizen || isRoku || (isAndroid && window.screen.width >= 1920);

  let type: PlatformType = 'web';
  if (isFireTV) type = 'firetv';
  else if (isTizen) type = 'tizen';
  else if (isRoku) type = 'roku';
  else if (isAlexa) type = 'alexa';
  else if (isCapacitor && isAndroid) type = 'android';
  else if (isCapacitor && isIOS) type = 'ios';

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
