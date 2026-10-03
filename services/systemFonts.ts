// systemFonts.ts — Enumerate available system fonts + combined with Tela's Google Fonts

import { FONTS, FontKey, ensureFontsLoaded } from './tela/telaFonts';

// Well-known system fonts across platforms
const SYSTEM_FONTS = [
  // Windows
  'Arial', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Palatino Linotype',
  'Segoe UI', 'Segoe Print', 'Segoe Script', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Bahnschrift', 'Franklin Gothic Medium',
  'Garamond', 'Book Antiqua', 'Century Gothic',
  // macOS / iOS
  'San Francisco', 'Helvetica Neue', 'Helvetica', 'Avenir', 'Avenir Next',
  'Futura', 'Gill Sans', 'Hoefler Text', 'Optima', 'Baskerville',
  'American Typewriter', 'Copperplate', 'Didot', 'Menlo', 'Monaco',
  'Rockwell', 'Cochin', 'Marker Felt', 'Noteworthy', 'Papyrus',
  // Android / Chrome OS
  'Roboto', 'Noto Sans', 'Noto Serif', 'Droid Sans', 'Droid Serif',
  // Cross-platform
  'Comic Sans MS', 'Arial Black', 'Lucida Sans Unicode',
];

export interface AvailableFont {
  family: string;
  source: 'system' | 'google' | 'custom';
  category: 'serif' | 'sans-serif' | 'display' | 'monospace' | 'handwriting';
  available: boolean;  // true if detected on this system
}

let _cachedFonts: AvailableFont[] | null = null;

// Detect if a font is available on the system
function isFontAvailable(fontFamily: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.fonts.check(`16px "${fontFamily}"`);
  } catch {
    // Fallback: canvas measurement comparison
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
    ctx.font = `72px monospace`;
    const defaultWidth = ctx.measureText(testStr).width;
    ctx.font = `72px "${fontFamily}", monospace`;
    return ctx.measureText(testStr).width !== defaultWidth;
  }
}

function categorizeFont(family: string): AvailableFont['category'] {
  const lower = family.toLowerCase();
  if (/mono|consolas|courier|menlo|monaco/.test(lower)) return 'monospace';
  if (/comic|marker|noteworthy|segoe script|papyrus|copperplate/.test(lower)) return 'handwriting';
  if (/impact|bahnschrift|franklin|century gothic|futura/.test(lower)) return 'display';
  if (/georgia|times|palatino|baskerville|garamond|cambria|didot|hoefler|cochin|book antiqua|rockwell|serif/i.test(lower)) return 'serif';
  return 'sans-serif';
}

export function getAvailableFonts(): AvailableFont[] {
  if (_cachedFonts) return _cachedFonts;
  
  const fonts: AvailableFont[] = [];
  
  // System fonts
  for (const family of SYSTEM_FONTS) {
    fonts.push({
      family,
      source: 'system',
      category: categorizeFont(family),
      available: isFontAvailable(family),
    });
  }
  
  // Google fonts from Tela
  for (const [key, spec] of Object.entries(FONTS)) {
    if (!fonts.some(f => f.family === spec.family)) {
      fonts.push({
        family: spec.family,
        source: 'google',
        category: spec.class === 'serif' ? 'serif' 
          : spec.class === 'mono' ? 'monospace'
          : spec.class === 'script' ? 'handwriting'
          : spec.class === 'display' || spec.class === 'blackletter' ? 'display'
          : 'sans-serif',
        available: true, // Google fonts are always loadable
      });
    }
  }
  
  // Sort: available first, then alphabetical
  fonts.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.family.localeCompare(b.family);
  });
  
  _cachedFonts = fonts;
  return fonts;
}

// Load a font (system fonts are already loaded, Google fonts need loading)
export async function loadFont(family: string): Promise<void> {
  const fontEntry = Object.entries(FONTS).find(([_, spec]) => spec.family === family);
  if (fontEntry) {
    ensureFontsLoaded([fontEntry[0] as FontKey]);
  }
  // System fonts are already available, no action needed
}

// Get font families grouped by category
export function getFontsByCategory(): Record<string, AvailableFont[]> {
  const fonts = getAvailableFonts().filter(f => f.available || f.source === 'google');
  const grouped: Record<string, AvailableFont[]> = {};
  for (const f of fonts) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }
  return grouped;
}
