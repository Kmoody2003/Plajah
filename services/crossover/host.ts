// Where Crossover is running. Media conversion is desktop and Android only for now. On the web it
// does captions and local review, which need no engine and never leave the browser.

import { Capacitor } from '@capacitor/core';
import { isWindowsApp } from '../windowsBridgeService';

export type CrossoverHost = 'desktop' | 'android' | 'web';

export function crossoverHost(): CrossoverHost {
  if (typeof window === 'undefined') return 'web';
  const forced = (window as any).__CROSSOVER_HOST__ as CrossoverHost | undefined; // the dev lab
  if (forced) return forced;
  if (isWindowsApp()) return 'desktop';
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}

