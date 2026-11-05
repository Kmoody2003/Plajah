/**
 * Installing Plajah as a web app (PWA). Chrome, Edge and Android fire `beforeinstallprompt` once,
 * early in the page's life, so this module is imported at startup (index.tsx) to catch it and
 * hold it until someone taps Install. Safari (iPhone/iPad, Mac) has no prompt: people add it from
 * the Share menu, so callers show steps instead.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch { /* */ } });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's mini-bar away; we offer it where it makes sense
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
}

/** Already running as an installed app (home-screen icon / app window). */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return installed
      || window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || (navigator as any).standalone === true;
  } catch { return false; }
}

export type InstallRoute = 'prompt' | 'ios' | 'mac-safari' | 'manual' | 'installed';

/** How this device installs: the browser prompt, Safari's Share menu, or the browser menu. */
export function installRoute(): InstallRoute {
  if (isStandaloneApp()) return 'installed';
  if (deferred) return 'prompt';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes('Mac') && (navigator as any).maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'mac-safari';
  return 'manual';
}

/** Show the browser's install dialog. Resolves true when they accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice.outcome === 'accepted') installed = true;
    emit();
    return choice.outcome === 'accepted';
  } catch { emit(); return false; }
}

export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
