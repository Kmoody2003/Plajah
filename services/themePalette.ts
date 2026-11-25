/**
 * Theme palette engine.
 *
 * A theme has a MAIN colour family (its surface — Dark, Light, Plajah …) and four accent
 * levels the user controls:
 *   accent1  primary accent   (buttons, active states, links)
 *   accent2  secondary        (chips, secondary buttons)       ← the colour the user picks
 *   accent3  tertiary         (highlights, charts, tags)
 *   accent4  quaternary       (badges, decorative)
 * Levels 3 and 4 are generated from the secondary using colour-theory schemes unless the user
 * overrides them. Every level also gets an `ink` variant — the same hue nudged in lightness
 * until it passes WCAG AA as TEXT on the active surface, so an accent can be a fill AND a
 * readable label without a second decision.
 */

export type PaletteScheme =
  | 'monochrome' | 'analogous' | 'complementary' | 'split' | 'triadic' | 'tetradic' | 'warm-cool';

export interface ThemePalette {
  scheme: PaletteScheme;
  accent1: string;
  accent2: string;
  accent3: string;
  accent4: string;
  /** Levels the user fixed by hand; generation never overwrites these. */
  locked?: Partial<Record<'accent1' | 'accent2' | 'accent3' | 'accent4', boolean>>;
  /**
   * Text roles the user fixed by hand (hex). A role left out is generated from the palette. Either
   * way the colour that reaches the page is nudged until it passes its contrast target on the
   * active surface, so a chosen colour can never make text unreadable.
   */
  text?: Partial<Record<TextRole, string>>;
}

export type TextRole = 'heading' | 'primary' | 'sub' | 'desc' | 'link';

export const TEXT_ROLES: { key: TextRole; label: string; hint: string; target: number }[] = [
  { key: 'heading', label: 'Headings',     hint: 'Page and section titles',            target: 7 },
  { key: 'primary', label: 'Primary text', hint: 'Names, rows, the main line of a card', target: 7 },
  { key: 'sub',     label: 'Sublines',     hint: 'The line under a title',              target: 4.5 },
  { key: 'desc',    label: 'Descriptions', hint: 'Helper copy, captions, metadata',     target: 4.5 },
  { key: 'link',    label: 'Links',        hint: 'Tappable text',                       target: 4.5 },
];

export const SCHEME_LABELS: Record<PaletteScheme, { label: string; hint: string }> = {
  monochrome:    { label: 'Monochrome',          hint: 'One hue, varied depth — calm and cohesive' },
  analogous:     { label: 'Analogous',           hint: 'Neighbouring hues — harmonious, low tension' },
  complementary: { label: 'Complementary',       hint: 'Opposites — high energy, strong contrast' },
  split:         { label: 'Split-complementary', hint: 'Opposite ± 30° — contrast without the clash' },
  triadic:       { label: 'Triadic',             hint: 'Three even hues — playful and balanced' },
  tetradic:      { label: 'Tetradic',            hint: 'Two complementary pairs — rich, needs care' },
  'warm-cool':   { label: 'Warm + cool',         hint: 'Temperature contrast around your colour' },
};

// ── colour math ─────────────────────────────────────────────────────────────

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace('#', '');
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) return null;
  const n = parseInt(f, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgbToHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
export function hslToRgb({ h, s, l }: HSL): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
export const hexToHsl = (hex: string): HSL => rgbToHsl(hexToRgb(hex) ?? { r: 255, g: 140, b: 0 });
export const hslToHex = (hsl: HSL) => rgbToHex(hslToRgb(hsl));

const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
export const relLuminance = (c: RGB) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export function contrast(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const l1 = relLuminance(ra), l2 = relLuminance(rb);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export const isLight = (hex: string) => { const r = hexToRgb(hex); return r ? relLuminance(r) > 0.4 : false; };

/** Pure ink for a surface: near-black or near-white, tinted a hair toward `tint` so it feels designed. */
export function inkFor(surface: string, tint?: string, strength = 0.06): string {
  const light = isLight(surface);
  const base: HSL = light ? { h: 222, s: 0.35, l: 0.1 } : { h: 40, s: 0.15, l: 0.97 };
  if (tint) { const t = hexToHsl(tint); base.h = t.h; base.s = Math.max(base.s, strength * 4); }
  return hslToHex(base);
}

/**
 * Nudge a colour's lightness (keeping hue/saturation) until it reaches `target`:1 against
 * `surface`. This is what makes an accent safe to use as text.
 */
export function readableOn(color: string, surface: string, target = 4.5): string {
  if (contrast(color, surface) >= target) return color;
  const hsl = hexToHsl(color);
  const goDarker = isLight(surface);
  let best = color;
  for (let i = 0; i < 60; i++) {
    hsl.l = Math.max(0, Math.min(1, hsl.l + (goDarker ? -0.015 : 0.015)));
    // Light surfaces also need a bit more saturation as the colour darkens or it turns muddy.
    best = hslToHex(hsl);
    if (contrast(best, surface) >= target) return best;
  }
  return goDarker ? '#0f172a' : '#ffffff';
}

// ── palette generation ─────────────────────────────────────────────────────

const rot = (hex: string, deg: number, dl = 0, ds = 0): string => {
  const c = hexToHsl(hex);
  return hslToHex({ h: c.h + deg, s: Math.max(0.15, Math.min(1, c.s + ds)), l: Math.max(0.18, Math.min(0.82, c.l + dl)) });
};

/** The three companion colours for a base, per scheme. */
export function companions(base: string, scheme: PaletteScheme): [string, string, string] {
  switch (scheme) {
    case 'monochrome':    return [rot(base, 0, -0.14), rot(base, 0, 0.16, -0.1), rot(base, 0, 0.28, -0.25)];
    case 'analogous':     return [rot(base, 30), rot(base, -30), rot(base, 60, -0.05)];
    case 'complementary': return [rot(base, 180), rot(base, 180, 0.14, -0.1), rot(base, 0, -0.16)];
    case 'split':         return [rot(base, 150), rot(base, 210), rot(base, 180, 0.15, -0.15)];
    case 'triadic':       return [rot(base, 120), rot(base, 240), rot(base, 0, 0.18, -0.2)];
    case 'tetradic':      return [rot(base, 90), rot(base, 180), rot(base, 270)];
    case 'warm-cool': {
      const warm = hexToHsl(base).h < 70 || hexToHsl(base).h > 300;
      return warm ? [rot(base, 170), rot(base, 200), rot(base, -25)] : [rot(base, -170), rot(base, -200), rot(base, 25)];
    }
  }
}

/**
 * Build a palette from the colour the user picked (their secondary). accent1 defaults to the
 * brand orange for Plajah continuity unless the user supplies one.
 */
export function generatePalette(secondary: string, scheme: PaletteScheme, accent1 = '#ff8c00', previous?: ThemePalette): ThemePalette {
  const [c3, c4, c5] = companions(secondary, scheme);
  const next: ThemePalette = {
    scheme,
    accent1: previous?.locked?.accent1 ? previous.accent1 : accent1,
    accent2: secondary,
    accent3: previous?.locked?.accent3 ? previous.accent3 : c3,
    accent4: previous?.locked?.accent4 ? previous.accent4 : c4,
    locked: previous?.locked,
  };
  void c5;
  return next;
}

/** One swatch set per scheme, from a single picked colour — the "generate palettes" feature. */
export function generateAllPalettes(secondary: string, accent1 = '#ff8c00'): ThemePalette[] {
  return (Object.keys(SCHEME_LABELS) as PaletteScheme[]).map(s => generatePalette(secondary, s, accent1));
}

export const DEFAULT_PALETTE: ThemePalette = generatePalette('#6b0099', 'analogous', '#ff8c00');

// ── text roles ─────────────────────────────────────────────────────────────

/** Linear blend of two hex colours: t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return a;
  return rgbToHex({ r: ra.r + (rb.r - ra.r) * t, g: ra.g + (rb.g - ra.g) * t, b: ra.b + (rb.b - ra.b) * t });
}

/**
 * Text colours derived from a palette and a surface: the hue of the palette's accents tints the
 * ink (so text feels part of the theme) while lightness is solved for contrast.
 *   primary  near-ink tinted toward accent 2
 *   heading  a deep/bright shade of accent 2's hue
 *   sub      primary eased toward the surface
 *   desc     primary eased further toward the surface
 *   link     accent 2 made readable
 */
export function autoTextRoles(p: ThemePalette, surface: string): Record<TextRole, string> {
  const light = isLight(surface);
  const h = hexToHsl(p.accent2);
  const primary = readableOn(mixHex(inkFor(surface), p.accent2, light ? 0.10 : 0.12), surface, 7);
  const heading = readableOn(hslToHex({ h: h.h, s: Math.min(0.62, Math.max(0.3, h.s)), l: light ? 0.2 : 0.9 }), surface, 7);
  const sub = readableOn(mixHex(primary, surface, 0.24), surface, 4.5);
  const desc = readableOn(mixHex(primary, surface, 0.42), surface, 4.5);
  const link = readableOn(p.accent2, surface, 4.5);
  return { heading, primary, sub, desc, link };
}

/** Auto roles with the user's overrides on top — each one re-solved for contrast. */
export function resolveTextRoles(p: ThemePalette, surface: string): Record<TextRole, string> {
  const auto = autoTextRoles(p, surface);
  const out = { ...auto };
  for (const r of TEXT_ROLES) {
    const custom = p.text?.[r.key];
    if (custom && hexToRgb(custom)) out[r.key] = readableOn(custom.startsWith('#') ? custom : '#' + custom, surface, r.target);
  }
  return out;
}

// ── applying ────────────────────────────────────────────────────────────────

/** The surface colour each built-in theme text sits on (used to compute the `ink` variants). */
export const THEME_SURFACE: Record<string, string> = {
  DARK: '#0b0b0e', LIGHT: '#dde3ea', PASTEL: '#fdf6e3', PLAJAH: '#1a0026',
  ETHEREAL: '#131314', NEBULA: '#0b0b24', CITRUS: '#1a0a02', BIG_SCREEN: '#00050a', PHONE: '#000000',
};

export function paletteVars(p: ThemePalette, surface: string): Record<string, string> {
  const v: Record<string, string> = {};
  (['accent1', 'accent2', 'accent3', 'accent4'] as const).forEach((k, i) => {
    const n = i + 1;
    v[`--pj-a${n}`] = p[k];
    v[`--pj-a${n}-ink`] = readableOn(p[k], surface, 4.5);     // as text on the page surface
    v[`--pj-a${n}-on`] = inkFor(p[k]);                         // text ON a fill of this accent
  });
  // Legacy tokens: text-small-orange / bg-small-orange / accent-colour consumers follow level 1.
  v['--text-secondary'] = v['--pj-a1-ink'];
  v['--accent-color'] = p.accent1;
  v['--pj-accent-ink'] = v['--pj-a1-ink'];
  // Tailwind's text-/bg-/border-small-orange read --color-small-orange, which index.css declares on
  // :root as var(--text-secondary). A var() is resolved where it is DECLARED, so overriding
  // --text-secondary lower down never reached it. Set the token itself, on <body>.
  v['--color-small-orange'] = v['--pj-a1-ink'];

  // Text roles (headings / primary / sublines / descriptions / links) — always contrast-solved.
  const t = resolveTextRoles(p, surface);
  v['--pj-t-heading'] = t.heading;
  v['--pj-t-primary'] = t.primary;
  v['--pj-t-sub'] = t.sub;
  v['--pj-t-desc'] = t.desc;
  v['--pj-t-link'] = t.link;
  // The light/pastel remaps in theme-system.css read these tokens, so they follow the roles too.
  v['--pj-text'] = t.primary;
  v['--pj-text-2'] = t.primary;
  v['--pj-text-muted'] = t.sub;
  v['--pj-text-faint'] = t.desc;
  v['--text-primary'] = t.primary;

  // The selection gradient: the Plajah brand gradient, or the palette's own three accents.
  v['--pj-grad-select'] = `linear-gradient(135deg, ${p.accent2} 0%, ${p.accent3} 52%, ${p.accent1} 100%)`;
  // Text ON that gradient. No single colour is perfect across a purple -> orange sweep, so choose by the
  // gradient's overall lightness: white (with a soft shadow for the bright end) on a dark/mid gradient
  // like the brand one, dark ink only when the whole gradient is light.
  const stops = [p.accent2, p.accent3, p.accent1];
  const avgLum = stops.reduce((a, c) => { const r = hexToRgb(c); return a + (r ? relLuminance(r) : 0); }, 0) / stops.length;
  const lightGradient = avgLum > 0.42;
  v['--pj-grad-on'] = lightGradient ? '#0f172a' : '#ffffff';
  v['--pj-grad-shadow'] = lightGradient ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.32)';
  return v;
}

const appliedKeys = new Set<string>();

export function applyPalette(p: ThemePalette | null | undefined, themeId: string) {
  if (typeof document === 'undefined') return;
  const body = document.body;
  appliedKeys.forEach(k => body.style.removeProperty(k));
  appliedKeys.clear();
  if (!p) { body.removeAttribute('data-pj-palette'); body.removeAttribute('data-pj-text'); return; }
  body.setAttribute('data-pj-palette', '1');
  body.setAttribute('data-pj-text', '1');
  const vars = paletteVars(p, THEME_SURFACE[themeId] ?? THEME_SURFACE.DARK);
  for (const [k, val] of Object.entries(vars)) { body.style.setProperty(k, val); appliedKeys.add(k); }
}
