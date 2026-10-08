import { googleFontsHref, type DossierTheme } from '../../services/dossier/dossierTheme';

const loaded = new Set<string>();

/**
 * Injects one Google Fonts stylesheet for the given themes, once per distinct set (same approach the
 * Folio and the film player use: a <link> in <head>). Safe to call on every render.
 */
export function ensureDossierFonts(themes: DossierTheme[]): void {
  if (typeof document === 'undefined' || !themes.length) return;
  const href = googleFontsHref(themes);
  if (loaded.has(href)) return;
  loaded.add(href);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.dataset.dossierFonts = '1';
  document.head.appendChild(l);
}

/** Resolves when the theme's display face has loaded, or after `ms` (never blocks the UI for long). */
export function whenDisplayFontReady(theme: DossierTheme, ms = 1200): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  const first = /'([^']+)'/.exec(theme.display)?.[1];
  if (!fonts || !first) return Promise.resolve();
  return Promise.race([
    fonts.load(`400 64px "${first}"`).then(() => undefined, () => undefined),
    new Promise<void>(r => window.setTimeout(r, ms)),
  ]);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
