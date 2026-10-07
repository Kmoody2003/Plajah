/**
 * Per-exhibit visual identity for the Dossier hall (pure data and helpers, no React).
 * The hall turns a theme into CSS variables; the registry gives every exhibit one.
 */

export interface DossierTheme {
  /** CSS font-family stack for the big display type (titles, numerals, readouts). */
  display: string;
  /** CSS font-family stack for reading text. */
  body: string;
  /** The exhibit's one ink colour (hex). */
  accent: string;
  /** The exhibit's ground (hex), a dark colour; panels and lines are derived from it. */
  bg: string;
  /** Set display type in capitals (Anton, Abril Fatface) or sentence case (the serif faces). */
  upper: boolean;
  /** Optional large title for the entrance and lobby when it differs from the dossier subject. */
  heroTitle?: string;
  /** Which montage asset the entrance holds on (an asset id); defaults to the middle frame. */
  entranceAsset?: string;
  /** Optional second-script word: a real word, set large, with its reading. Never decoration only. */
  script?: { word: string; font: string; reading: string; dir?: 'rtl' | 'ltr' };
  /** Google Fonts family specs the theme needs, e.g. "Anton" or "Source Serif 4:opsz,wght@8..60,400;8..60,600". */
  fonts: string[];
}

/** Used when an exhibit has no theme: neutral near-black, warm gold. */
export const DEFAULT_THEME: DossierTheme = {
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  body: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  accent: '#f0c987',
  bg: '#121014',
  upper: false,
  fonts: ['Fraunces:opsz,wght@9..144,400;9..144,800', 'Source Serif 4:opsz,wght@8..60,400;8..60,600'],
};

const HEX = /^#([0-9a-f]{6})$/i;

/** Mixes two #rrggbb colours; `t` is how much of `b` (0..1). Falls back to `a` for bad input. */
export function mixHex(a: string, b: string, t: number): string {
  const ma = HEX.exec(a), mb = HEX.exec(b);
  if (!ma || !mb) return a;
  const k = Math.min(1, Math.max(0, t));
  const ch = (i: number) => {
    const x = parseInt(ma[1].slice(i, i + 2), 16), y = parseInt(mb[1].slice(i, i + 2), 16);
    return Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = HEX.exec(hex);
  if (!m) return 0;
  const f = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ink to put on top of the accent colour (near-black or near-white, whichever reads better). */
export function inkOn(accent: string): string {
  return contrastRatio(accent, '#0b0a0d') >= contrastRatio(accent, '#ffffff') ? '#0b0a0d' : '#ffffff';
}

/** CSS custom properties the hall sets on its root for a theme. */
export function themeVars(theme: DossierTheme): Record<string, string> {
  return {
    '--dh-a': theme.accent,
    '--dh-a-ink': inkOn(theme.accent),
    '--dh-bg': theme.bg,
    '--dh-panel': mixHex(theme.bg, '#ffffff', 0.06),
    '--dh-panel-2': mixHex(theme.bg, '#ffffff', 0.11),
    '--dh-font-d': theme.display,
    '--dh-font-b': theme.body,
    '--dh-upper': theme.upper ? 'uppercase' : 'none',
    '--dh-d-weight': theme.upper ? '400' : '700',
    '--dh-d-track': theme.upper ? '-0.01em' : '-0.025em',
  };
}

/** A single Google Fonts css2 URL for the union of the given themes' fonts (plus Inter for system voice). */
export function googleFontsHref(themes: DossierTheme[]): string {
  const seen = new Set<string>(['Inter:wght@400;500;600;700']);
  for (const t of themes) for (const f of t.fonts) seen.add(f);
  const fam = [...seen].map(s => `family=${s.replace(/ /g, '+')}`).join('&');
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}

/**
 * Display size (in vw) for a hero title so long room names still fit: short titles go to 13-14vw,
 * long ones step down. Anton-like condensed faces get a little more room than wide serifs.
 */
export function heroTitleVw(title: string, upper: boolean): number {
  const longest = Math.max(...title.split(/\s+/).map(w => w.length), 1);
  const n = title.length;
  const k = upper ? 1 : 0.86;
  let vw: number;
  if (n <= 10) vw = 14;
  else if (n <= 18) vw = 12;
  else if (n <= 28) vw = 9.4;
  else if (n <= 42) vw = 7.2;
  else vw = 5.6;
  // A single very long word must still fit its column.
  if (longest > 12) vw = Math.min(vw, 70 / longest);
  return Math.round(vw * k * 10) / 10;
}

/** The display font and uppercase rule for a theme, for use in inline styles. */
export const themeTitleStyle = (theme: DossierTheme) => ({
  fontFamily: theme.display,
  textTransform: theme.upper ? ('uppercase' as const) : ('none' as const),
  fontWeight: theme.upper ? 400 : 700,
});

/** Rough average glyph width (in em) of a theme's display face, for sizing titles to a box. */
export function glyphEm(theme: DossierTheme): number {
  const first = (/'([^']+)'/.exec(theme.display)?.[1] ?? '').toLowerCase();
  if (first === 'anton') return 0.48;
  if (first === 'abril fatface') return 0.74;
  if (first === 'cormorant garamond') return 0.46;
  if (first === 'fraunces') return 0.56;
  if (first === 'libre caslon text' || first === 'libre caslon display') return 0.68;
  return theme.upper ? 0.66 : 0.54;
}

/**
 * Title size in container-width units (cqw) so a title fits a card: limited by its longest word and by
 * the area it may take (about 100 wide by 55 tall in cqw), capped at 40.
 */
export function fitTitleCqw(title: string, theme: DossierTheme): number {
  const em = glyphEm(theme);
  const words = title.split(/\s+/).filter(Boolean);
  const longest = Math.max(...words.map(w => w.length), 1);
  const byWord = 88 / (longest * em);
  const byArea = Math.sqrt(5500 / (Math.max(title.length, 1) * em * 0.92));
  return Math.round(Math.min(40, byWord, byArea) * 10) / 10;
}

/**
 * Entrance title size in vw: the hero size scaled up a little, but never wider than `budgetVw` for its
 * longest word, so the title can be kept clear of a face on the other side of the screen.
 */
export function entranceTitleVw(title: string, theme: DossierTheme, budgetVw: number): number {
  const longest = Math.max(...title.split(/\s+/).map(w => w.length), 1);
  const v = Math.min(heroTitleVw(title, theme.upper) * 1.3, budgetVw / (longest * glyphEm(theme)));
  return Math.round(v * 10) / 10;
}
