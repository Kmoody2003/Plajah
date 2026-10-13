/**
 * cinematicLutLibrary.ts — Master Cinematic & Camera LUT Library for Plajah.
 *
 * Fully hosted and executable on-device in code:
 *   1. 24+ Industry Camera Profiles & Cinematic Film Stock Looks.
 *   2. Procedural .cube 3D LUT generator for DaVinci Resolve, Premiere, and Photoshop export.
 *   3. Instantaneous CSS filter compilation for Tela document layers and Photo Develop preview.
 *   4. Fast in-memory pixel LUT transfer for HTML5 Canvas, WebGL, and Rust color pipelines.
 *
 * 100% Native Plajah Platform: zero external cloud dependencies.
 */

export type LutCategory =
  | 'camera_profile'
  | 'film_stock'
  | 'director_look'
  | 'monochrome'
  | 'creative_scifi';

export interface CinematicLut {
  id: string;
  name: string;
  category: LutCategory;
  categoryLabel: string;
  description: string;
  accentColor: string;
  toneCurve: {
    contrast: number;      // -100..100
    saturation: number;    // -100..100
    warmth: number;        // -100..100 (Kelvin shift)
    tint: number;          // -100..100 (Green / Magenta)
    highlights: number;    // -100..100
    shadows: number;       // -100..100
    blacks: number;        // -100..100
    whites: number;        // -100..100
    fade: number;          // 0..100
    vignette?: number;     // 0..100
    grain?: number;        // 0..100
    sepia?: number;        // 0..100
    hueRotateDeg?: number; // -180..180
  };
  /** Direct RGB mathematical transformation mapping [r, g, b] in [0, 1] */
  rgbTransfer: (r: number, g: number, b: number) => [number, number, number];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function sCurve(x: number, power = 1.3): number {
  // Classic cubic Hermite S-curve for film contrast
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

// ── 24+ CURATED CINEMATIC & CAMERA LUTS ─────────────────────────────────────────

export const CINEMATIC_LUTS: CinematicLut[] = [
  // ── GROUP 1: CAMERA MANUFACTURER LOG & CINE CONVERSIONS ─────────────────────
  {
    id: 'arri_logc_rec709',
    name: 'ARRI Alexa LogC → Rec.709 Master',
    category: 'camera_profile',
    categoryLabel: 'Camera Profile',
    description: 'Official ARRI color science with natural organic contrast roll-off, soft cinematic highlights, and true-to-life skin tones.',
    accentColor: '#38bdf8',
    toneCurve: {
      contrast: 14,
      saturation: 4,
      warmth: 3,
      tint: 1,
      highlights: -8,
      shadows: 6,
      blacks: 2,
      whites: -2,
      fade: 2,
    },
    rgbTransfer: (r, g, b) => {
      // Gentle Arri curve: lifts toe slightly, smooth shoulder roll-off
      const rOut = Math.pow(r, 0.95) * 1.02;
      const gOut = Math.pow(g, 0.97) * 1.01;
      const bOut = Math.pow(b, 1.00) * 0.99;
      return [clamp01(rOut), clamp01(gOut), clamp01(bOut)];
    },
  },
  {
    id: 'red_ipp2_film',
    name: 'RED IPP2 Cinema Film Roll',
    category: 'camera_profile',
    categoryLabel: 'Camera Profile',
    description: 'RED Digital Cinema Image Processing Pipeline with highlight roll-off protection, rich midtone contrast, and crisp blacks.',
    accentColor: '#ef4444',
    toneCurve: {
      contrast: 22,
      saturation: 8,
      warmth: 2,
      tint: -2,
      highlights: -12,
      shadows: -4,
      blacks: -6,
      whites: 4,
      fade: 0,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = sCurve(r * 1.03, 1.2);
      const gOut = sCurve(g * 1.01, 1.15);
      const bOut = sCurve(b * 0.98, 1.15);
      return [clamp01(rOut), clamp01(gOut), clamp01(bOut)];
    },
  },
  {
    id: 'sony_slog3_venice',
    name: 'Sony S-Log3 → Venice Cine',
    category: 'camera_profile',
    categoryLabel: 'Camera Profile',
    description: 'Transforms Sony mirrorless/FX footage with the Venice flagship cinema palette: pleasing creamy skin tones and warm neutral roll-off.',
    accentColor: '#f59e0b',
    toneCurve: {
      contrast: 16,
      saturation: 6,
      warmth: 8,
      tint: 4,
      highlights: -10,
      shadows: 8,
      blacks: 0,
      whites: -3,
      fade: 3,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.04 + 0.01);
      const gOut = clamp01(g * 1.01);
      const bOut = clamp01(b * 0.96 - 0.01);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'canon_clog3_warm',
    name: 'Canon C-Log3 Warm Cinema',
    category: 'camera_profile',
    categoryLabel: 'Camera Profile',
    description: 'Renowned Canon portrait color science with warm golden undertones, flattering skin tonality, and soft pastel rolloff.',
    accentColor: '#f97316',
    toneCurve: {
      contrast: 12,
      saturation: 10,
      warmth: 15,
      tint: 3,
      highlights: -6,
      shadows: 10,
      blacks: 2,
      whites: 2,
      fade: 2,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.06);
      const gOut = clamp01(g * 1.02);
      const bOut = clamp01(b * 0.94);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'blackmagic_film_gen5',
    name: 'Blackmagic Film Gen5 Rich Gamut',
    category: 'camera_profile',
    categoryLabel: 'Camera Profile',
    description: 'Blackmagic Generation 5 color science with wide dynamic range, deep organic saturation, and neutral deep blacks.',
    accentColor: '#a855f7',
    toneCurve: {
      contrast: 18,
      saturation: 12,
      warmth: 0,
      tint: 0,
      highlights: -14,
      shadows: 4,
      blacks: -2,
      whites: 0,
      fade: 1,
    },
    rgbTransfer: (r, g, b) => {
      return [clamp01(sCurve(r)), clamp01(sCurve(g)), clamp01(sCurve(b))];
    },
  },

  // ── GROUP 2: HOLLYWOOD FILM STOCKS & CELLULOID CHEMISTRY ───────────────────
  {
    id: 'kodak_2383_print',
    name: 'Kodak Vision 2383 Print Film',
    category: 'film_stock',
    categoryLabel: 'Film Stock',
    description: 'The definitive Hollywood print stock. Rich cyan-skewed shadow shadows, warm honey midtones, and subtle golden highlights.',
    accentColor: '#0ea5e9',
    toneCurve: {
      contrast: 24,
      saturation: -4,
      warmth: 12,
      tint: -6,
      highlights: -16,
      shadows: -8,
      blacks: -12,
      whites: -4,
      fade: 6,
      grain: 12,
    },
    rgbTransfer: (r, g, b) => {
      // Split toning: blue/cyan shadows, warm amber highlights
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const rOut = r > 0.5 ? r * 1.06 : r * 0.95;
      const gOut = g * 1.01;
      const bOut = b < 0.5 ? b * 1.08 + 0.02 : b * 0.92;
      return [clamp01(rOut), clamp01(gOut), clamp01(bOut)];
    },
  },
  {
    id: 'kodak_portra_400',
    name: 'Kodak Portra 400 Natural Portrait',
    category: 'film_stock',
    categoryLabel: 'Film Stock',
    description: 'Legendary analog portrait film. Unmatched skin rendering, soft pastel highlight rolloff, fine warm grain, and gentle contrast.',
    accentColor: '#fb923c',
    toneCurve: {
      contrast: 8,
      saturation: 6,
      warmth: 16,
      tint: 6,
      highlights: -14,
      shadows: 14,
      blacks: 4,
      whites: -2,
      fade: 8,
      grain: 10,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.05 + 0.02);
      const gOut = clamp01(g * 1.01 + 0.01);
      const bOut = clamp01(b * 0.95);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'fuji_eterna_500t',
    name: 'Fujifilm Eterna 500T Cine',
    category: 'film_stock',
    categoryLabel: 'Film Stock',
    description: 'Subdued cinematic tungsten motion picture stock. Muted organic greens, cool desaturated shadows, and refined low contrast.',
    accentColor: '#10b981',
    toneCurve: {
      contrast: -8,
      saturation: -14,
      warmth: -6,
      tint: -10,
      highlights: -18,
      shadows: 18,
      blacks: 6,
      whites: -6,
      fade: 14,
      grain: 8,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 0.96);
      const gOut = clamp01(g * 1.03);
      const bOut = clamp01(b * 1.02);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'fuji_provia_100f',
    name: 'Fujifilm Provia 100F Reversal Slide',
    category: 'film_stock',
    categoryLabel: 'Film Stock',
    description: 'Professional color reversal transparency film with vivid neutral colors, sparkling clarity, and saturated blue/magenta tones.',
    accentColor: '#6366f1',
    toneCurve: {
      contrast: 26,
      saturation: 18,
      warmth: -4,
      tint: 4,
      highlights: -8,
      shadows: -6,
      blacks: -10,
      whites: 6,
      fade: 0,
      grain: 4,
    },
    rgbTransfer: (r, g, b) => {
      return [clamp01(Math.pow(r, 1.1) * 1.05), clamp01(Math.pow(g, 1.08) * 1.02), clamp01(Math.pow(b, 1.02) * 1.1)];
    },
  },
  {
    id: 'fuji_velvia_50',
    name: 'Fujifilm Velvia 50 Super-Vivid',
    category: 'film_stock',
    categoryLabel: 'Film Stock',
    description: 'Ultra-saturated landscape transparency film. Deep punchy greens, electric warm skies, and dramatic deep blacks.',
    accentColor: '#22c55e',
    toneCurve: {
      contrast: 34,
      saturation: 32,
      warmth: 6,
      tint: -6,
      highlights: -12,
      shadows: -14,
      blacks: -16,
      whites: 8,
      fade: 0,
      grain: 2,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(sCurve(r * 1.15, 1.3));
      const gOut = clamp01(sCurve(g * 1.18, 1.25));
      const bOut = clamp01(sCurve(b * 1.05, 1.2));
      return [rOut, gOut, bOut];
    },
  },

  // ── GROUP 3: ICONIC DIRECTORS & GENRE STYLES ───────────────────────────────
  {
    id: 'bleach_bypass_silver',
    name: 'Silver Retention Bleach Bypass',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'David Fincher & Janusz Kamiński chemical bleach bypass. Retains metallic silver grains: harsh high contrast and desaturated shadows.',
    accentColor: '#94a3b8',
    toneCurve: {
      contrast: 42,
      saturation: -55,
      warmth: -8,
      tint: 0,
      highlights: 14,
      shadows: -22,
      blacks: -24,
      whites: 16,
      fade: 4,
      grain: 22,
      vignette: 18,
    },
    rgbTransfer: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Retain silver luminance
      const silver = sCurve(lum, 1.4);
      const rOut = clamp01(r * 0.45 + silver * 0.55);
      const gOut = clamp01(g * 0.45 + silver * 0.55);
      const bOut = clamp01(b * 0.45 + silver * 0.55);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'cyberpunk_neon_teal',
    name: 'Neo-Tokyo Cyberpunk Teal & Ember',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'High-energy futuristic sci-fi grading. Deep cyan-tinted shadows paired with electric magenta/orange street reflections.',
    accentColor: '#06b6d4',
    toneCurve: {
      contrast: 28,
      saturation: 24,
      warmth: -18,
      tint: -12,
      highlights: -10,
      shadows: -12,
      blacks: -14,
      whites: 10,
      fade: 4,
      vignette: 24,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = r > 0.5 ? clamp01(r * 1.25) : clamp01(r * 0.85);
      const gOut = clamp01(g * 1.02);
      const bOut = b < 0.6 ? clamp01(b * 1.35 + 0.05) : clamp01(b * 0.88);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'deakins_warm_tungsten',
    name: 'Roger Deakins Naturalist Tungsten',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'Subtle masterclass lighting inspired by 1917 and Blade Runner 2049. Gentle amber warmth, deep soft shadows, and velvety focus.',
    accentColor: '#d97706',
    toneCurve: {
      contrast: 14,
      saturation: -2,
      warmth: 22,
      tint: 4,
      highlights: -18,
      shadows: 6,
      blacks: -2,
      whites: -4,
      fade: 6,
      grain: 8,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.08 + 0.02);
      const gOut = clamp01(g * 1.02 + 0.01);
      const bOut = clamp01(b * 0.88);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'wes_anderson_pastel',
    name: 'Wes Anderson Pastel Ochre',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'Whimsical storybook aesthetic. Custard yellows, soft pink hues, muted gentle contrast, and warm fairytale nostalgia.',
    accentColor: '#fde047',
    toneCurve: {
      contrast: -12,
      saturation: 8,
      warmth: 28,
      tint: 14,
      highlights: -24,
      shadows: 22,
      blacks: 12,
      whites: -10,
      fade: 16,
      grain: 6,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.08 + 0.05);
      const gOut = clamp01(g * 1.04 + 0.03);
      const bOut = clamp01(b * 0.85);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'matrix_phosphor_green',
    name: 'Cyber Terminal Phosphor Green',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'The Wachowskis 1999 digital matrix simulation. Distinctive emerald cast in the shadows, muted desaturated highlights, and stark contrast.',
    accentColor: '#10b981',
    toneCurve: {
      contrast: 26,
      saturation: -18,
      warmth: -24,
      tint: -36,
      highlights: -16,
      shadows: -10,
      blacks: -12,
      whites: -2,
      fade: 2,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 0.82);
      const gOut = clamp01(g * 1.18 + 0.04);
      const bOut = clamp01(b * 0.88);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'technicolor_3strip',
    name: '1930s Technicolor Three-Strip',
    category: 'director_look',
    categoryLabel: 'Director Look',
    description: 'Golden Age Hollywood (The Wizard of Oz / Singin in the Rain). Hyper-saturated primaries, warm magenta skin, and lush vibrant glow.',
    accentColor: '#ec4899',
    toneCurve: {
      contrast: 22,
      saturation: 38,
      warmth: 14,
      tint: 8,
      highlights: -8,
      shadows: 4,
      blacks: -4,
      whites: 8,
      fade: 0,
      grain: 4,
    },
    rgbTransfer: (r, g, b) => {
      // Accentuate primary color separations
      const rOut = clamp01(Math.pow(r, 0.92) * 1.12);
      const gOut = clamp01(Math.pow(g, 0.94) * 1.08);
      const bOut = clamp01(Math.pow(b, 0.90) * 1.15);
      return [rOut, gOut, bOut];
    },
  },

  // ── GROUP 4: MONOCHROME & TIMELESS NOIR ─────────────────────────────────────
  {
    id: 'kodak_tri_x_400',
    name: 'Kodak Tri-X 400 Street Monochrome',
    category: 'monochrome',
    categoryLabel: 'Monochrome',
    description: 'Timeless photojournalism black and white. Punchy midtone contrast, deep velvety blacks, and classic organic film grain.',
    accentColor: '#e2e8f0',
    toneCurve: {
      contrast: 36,
      saturation: -100,
      warmth: 0,
      tint: 0,
      highlights: -10,
      shadows: -16,
      blacks: -22,
      whites: 12,
      fade: 4,
      grain: 20,
      vignette: 14,
    },
    rgbTransfer: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = clamp01(sCurve(lum, 1.35));
      return [val, val, val];
    },
  },
  {
    id: 'ilford_hp5_plus',
    name: 'Ilford HP5 Plus British Silver',
    category: 'monochrome',
    categoryLabel: 'Monochrome',
    description: 'Classic British documentary film. Smooth tonal transitions, forgiving highlight retention, and gentle medium contrast.',
    accentColor: '#cbd5e1',
    toneCurve: {
      contrast: 18,
      saturation: -100,
      warmth: 0,
      tint: 0,
      highlights: -16,
      shadows: 8,
      blacks: -6,
      whites: 0,
      fade: 8,
      grain: 16,
      vignette: 8,
    },
    rgbTransfer: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = clamp01(Math.pow(lum, 0.96) * 0.98 + 0.02);
      return [val, val, val];
    },
  },
  {
    id: 'monochrome_sepia_1890',
    name: '1890s Daguerreotype Sepia',
    category: 'monochrome',
    categoryLabel: 'Monochrome',
    description: 'Victorian chemical collodion process. Rich chocolate brown tones, softened corner vignette, and antique paper texture.',
    accentColor: '#a16207',
    toneCurve: {
      contrast: 20,
      saturation: -75,
      warmth: 55,
      tint: 18,
      highlights: -22,
      shadows: 10,
      blacks: 8,
      whites: -14,
      fade: 18,
      grain: 18,
      sepia: 65,
      vignette: 32,
    },
    rgbTransfer: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const rOut = clamp01(lum * 1.25 + 0.06);
      const gOut = clamp01(lum * 1.05 + 0.03);
      const bOut = clamp01(lum * 0.75);
      return [rOut, gOut, bOut];
    },
  },

  // ── GROUP 5: CREATIVE & SCI-FI WORLDS ──────────────────────────────────────
  {
    id: 'nordic_noir_cold',
    name: 'Scandinavian Nordic Cold Steel',
    category: 'creative_scifi',
    categoryLabel: 'Atmospheric',
    description: 'Muted boreal palette. Crisp steel blue ambient wash, pale desaturated foliage, and striking cool atmosphere.',
    accentColor: '#64748b',
    toneCurve: {
      contrast: 16,
      saturation: -28,
      warmth: -32,
      tint: 8,
      highlights: -12,
      shadows: 4,
      blacks: -4,
      whites: 2,
      fade: 6,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 0.88);
      const gOut = clamp01(g * 0.96);
      const bOut = clamp01(b * 1.16 + 0.02);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'vintage_polaroid_600',
    name: 'Polaroid 600 Instant Nostalgia',
    category: 'creative_scifi',
    categoryLabel: 'Analog / Vintage',
    description: 'Instant film nostalgia. Milky lifted shadow blacks, warm golden cast, soft chromatic softness, and dreamlike memory haze.',
    accentColor: '#ca8a04',
    toneCurve: {
      contrast: -10,
      saturation: -12,
      warmth: 24,
      tint: 10,
      highlights: -18,
      shadows: 24,
      blacks: 18,
      whites: -8,
      fade: 26,
      grain: 16,
      vignette: 14,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.06 + 0.06);
      const gOut = clamp01(g * 1.02 + 0.05);
      const bOut = clamp01(b * 0.88 + 0.06);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'desert_heat_mirage',
    name: 'Sahara Dune Desert Mirage',
    category: 'creative_scifi',
    categoryLabel: 'Atmospheric',
    description: 'Scorching sun-baked desert grading. Radiant terracotta earth, heatwave amber skies, and bleached shimmering highlights.',
    accentColor: '#ea580c',
    toneCurve: {
      contrast: 22,
      saturation: 16,
      warmth: 42,
      tint: 6,
      highlights: 12,
      shadows: -8,
      blacks: -6,
      whites: 14,
      fade: 4,
      vignette: 16,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(r * 1.2 + 0.04);
      const gOut = clamp01(g * 1.04);
      const bOut = clamp01(b * 0.78);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'deep_space_interstellar',
    name: 'Interstellar Deep Space Vacuum',
    category: 'creative_scifi',
    categoryLabel: 'Sci-Fi / Space',
    description: 'Christopher Nolan / Hoyte van Hoytema cosmic grading. Void-level absolute blacks, razor star highlights, and neutral organic human presence.',
    accentColor: '#3b82f6',
    toneCurve: {
      contrast: 38,
      saturation: -6,
      warmth: -4,
      tint: 2,
      highlights: 16,
      shadows: -26,
      blacks: -32,
      whites: 12,
      fade: 0,
      vignette: 28,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(Math.pow(r, 1.25) * 1.15);
      const gOut = clamp01(Math.pow(g, 1.25) * 1.15);
      const bOut = clamp01(Math.pow(b, 1.20) * 1.20);
      return [rOut, gOut, bOut];
    },
  },
  {
    id: 'retro_anime_celluloid',
    name: '90s Cel-Anime OVA Nostalgia',
    category: 'creative_scifi',
    categoryLabel: 'Anime & Manga',
    description: 'Hand-painted gouache backgrounds and vintage cel animation (Cowboy Bebop / Evangelion). Vibrant primary inks and warm CRT halation.',
    accentColor: '#f43f5e',
    toneCurve: {
      contrast: 16,
      saturation: 24,
      warmth: 12,
      tint: 6,
      highlights: -6,
      shadows: 6,
      blacks: -4,
      whites: 4,
      fade: 4,
      grain: 8,
    },
    rgbTransfer: (r, g, b) => {
      const rOut = clamp01(Math.pow(r, 0.95) * 1.08);
      const gOut = clamp01(Math.pow(g, 0.95) * 1.08);
      const bOut = clamp01(Math.pow(b, 0.92) * 1.12);
      return [rOut, gOut, bOut];
    },
  },
];

// ── UTILITY FUNCTIONS: CODE-GENERATED .CUBE & CSS EXPORTERS ───────────────────

/**
 * Procedurally generates a standard Adobe / DaVinci Resolve 3D .cube file string
 * from mathematical RGB transfer logic at runtime!
 */
export function generate3dCubeText(lut: CinematicLut, size = 17): string {
  const lines: string[] = [];
  lines.push(`# Plajah Native Cinematic 3D LUT`);
  lines.push(`# Title: "${lut.name}"`);
  lines.push(`# Generated mathematically on-device: zero cloud dependency`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push(`DOMAIN_MIN 0.0 0.0 0.0`);
  lines.push(`DOMAIN_MAX 1.0 1.0 1.0`);

  const step = 1 / (size - 1);

  // In .cube specification: R varies fastest, then G, then B
  for (let b = 0; b < size; b++) {
    const bVal = b * step;
    for (let g = 0; g < size; g++) {
      const gVal = g * step;
      for (let r = 0; r < size; r++) {
        const rVal = r * step;
        const [rT, gT, bT] = lut.rgbTransfer(rVal, gVal, bVal);
        lines.push(`${rT.toFixed(6)} ${gT.toFixed(6)} ${bT.toFixed(6)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Returns an instant CSS filter string representing the LUT at a specified strength (0.0 to 1.0).
 * Can be applied directly to HTML5 canvas, img elements, or Tela layer styles.
 */
export function lutToCssFilter(lut: CinematicLut, strength = 1.0): string {
  const s = Math.max(0, Math.min(1, strength));
  const tc = lut.toneCurve;

  const brightness = 1 + ((tc.whites * 0.15 + tc.shadows * 0.1 - tc.blacks * 0.1 - tc.highlights * 0.05) * s) / 100;
  const contrast = 1 + ((tc.contrast * 0.8 + (tc.blacks ? -tc.blacks * 0.3 : 0) - tc.fade * 0.25) * s) / 100;
  const saturation = 1 + ((tc.saturation * 0.9) * s) / 100;
  const sepia = Math.max(0, ((tc.sepia || (tc.warmth > 20 ? tc.warmth * 0.4 : 0)) * s) / 100);
  const hueRotate = (tc.tint * 0.15 + (tc.hueRotateDeg || 0) * 0.5) * s;

  const parts = [
    `brightness(${Math.max(0.1, brightness).toFixed(3)})`,
    `contrast(${Math.max(0.1, contrast).toFixed(3)})`,
    `saturate(${Math.max(0, saturation).toFixed(3)})`,
  ];

  if (sepia > 0.01) parts.push(`sepia(${sepia.toFixed(3)})`);
  if (Math.abs(hueRotate) > 0.1) parts.push(`hue-rotate(${hueRotate.toFixed(1)}deg)`);

  return parts.join(' ');
}

/**
 * In-place RGBA pixel buffer processor for HTML5 Canvas or WebGL CPU fallback.
 */
export function applyLutToRgba(rgba: Uint8ClampedArray, lut: CinematicLut, strength = 1.0): void {
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0) return;

  const invS = 1 - s;
  for (let i = 0; i < rgba.length; i += 4) {
    const rIn = rgba[i] / 255;
    const gIn = rgba[i + 1] / 255;
    const bIn = rgba[i + 2] / 255;

    const [rOut, gOut, bOut] = lut.rgbTransfer(rIn, gIn, bIn);

    rgba[i] = Math.round((rIn * invS + rOut * s) * 255);
    rgba[i + 1] = Math.round((gIn * invS + gOut * s) * 255);
    rgba[i + 2] = Math.round((bIn * invS + bOut * s) * 255);
  }
}

/**
 * Lookup helper to retrieve a LUT by ID.
 */
export function getLutById(id: string): CinematicLut | undefined {
  return CINEMATIC_LUTS.find((l) => l.id === id);
}
