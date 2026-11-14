// import/fontResolve — PostScript font names from PSD / AI files → something Tela can draw.
//
// Three outcomes, in order of preference:
//   installed   the family is on this machine (detected by canvas metrics, no permission prompt)
//   library     it is in Tela's open-font palette (telaFonts), loaded on demand
//   substitute  a close open font, while the original family stays first in the CSS stack so the
//               text corrects itself on any machine that has the font
// Commercial fonts are never bundled or fetched; the import report names every substitution.
import { FONTS, ensureFontsLoaded, type FontKey } from '../telaFonts';
import type { ResolvedFont } from './types';

const WEIGHT_WORDS: Array<[RegExp, number]> = [[/hairline|thin/i, 100], [/extra-?light|ultra-?light/i, 200], [/light/i, 300], [/medium/i, 500], [/semi-?bold|demi-?bold|demi/i, 600], [/extra-?bold|ultra-?bold|heavy/i, 800], [/black|ultra/i, 900], [/bold/i, 700]];

/** "Gotham-MediumItalic" → family "Gotham", weight 500, italic. "BebasNeue" → "Bebas Neue". */
export function parsePostScriptName(name: string): { family: string; weight: number; italic: boolean } {
  const clean = name.replace(/^[A-Z]{6}\+/, '').replace(/_/g, ' ');
  const dash = clean.lastIndexOf('-');
  let fam = dash > 0 ? clean.slice(0, dash) : clean, style = dash > 0 ? clean.slice(dash + 1) : '';
  if (!style) { const m = /(Thin|ExtraLight|Light|Regular|Medium|SemiBold|DemiBold|Bold|ExtraBold|Black|Heavy|Italic|Oblique)+$/.exec(fam); if (m && m.index > 0) { style = m[0]; fam = fam.slice(0, m.index); } }
  fam = fam.replace(/(PS|MT|Std|Pro|LT|OT)$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2').trim();
  const italic = /italic|oblique/i.test(style);
  let weight = 400; for (const [re, w] of WEIGHT_WORDS) if (re.test(style)) { weight = w; break; }
  return { family: fam || clean, weight, italic };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Close open alternatives for the commercial and system fonts designers reach for most. */
const SUBSTITUTES: Record<string, FontKey | string> = {
  gotham: 'Montserrat', proximanova: 'Montserrat', avenir: 'Nunito', avenirnext: 'Nunito', futura: 'Jost', 'futurapt': 'Jost', gillsans: 'Lato', helvetica: 'Inter', helveticaneue: 'Inter', arial: 'Inter', myriad: 'Open Sans', myriadpro: 'Open Sans', segoeui: 'Open Sans', calibri: 'Carlito', tahoma: 'Open Sans', verdana: 'Open Sans', sfprodisplay: 'Inter', sfprotext: 'Inter',
  impact: 'Anton', bebas: 'Bebas Neue', bebasneue: 'Bebas Neue', leaguegothic: 'League Gothic', knockout: 'Oswald', trajan: 'Cinzel', trajanpro: 'Cinzel', optima: 'Marcellus', copperplate: 'Cinzel',
  timesnewroman: 'EB Garamond', times: 'EB Garamond', georgia: 'Merriweather', garamond: 'EB Garamond', adobegaramond: 'EB Garamond', minion: 'Crimson Pro', minionpro: 'Crimson Pro', baskerville: 'Libre Baskerville', didot: 'Bodoni Moda', bodoni: 'Bodoni Moda', caslon: 'Libre Baskerville', rockwell: 'Roboto Slab',
  couriernew: 'JetBrains Mono', courier: 'JetBrains Mono', consolas: 'JetBrains Mono',
};
const CLASS_FALLBACK: Array<[RegExp, string]> = [[/serif|roman|garamond|book|times/i, 'EB Garamond'], [/script|hand|brush|callig/i, 'Caveat'], [/mono|code|typewriter/i, 'JetBrains Mono'], [/condensed|narrow|compressed/i, 'Oswald'], [/./, 'Inter']];

const libraryIndex = new Map<string, { key: string; family: string; fallback: string }>();
for (const [key, f] of Object.entries(FONTS)) libraryIndex.set(norm(f.family), { key, family: f.family, fallback: f.fallback });

/** Metric probe: a font is present if text in it measures differently from both generic fallbacks. */
function isInstalled(family: string, ctx: { font: string; measureText(t: string): { width: number } } | null): boolean {
  if (!ctx) return false;
  const probe = 'mmmmmmmmmmlliWQg0@#';
  const width = (stack: string) => { ctx.font = `72px ${stack}`; return ctx.measureText(probe).width; };
  const quoted = `"${family.replace(/"/g, '')}"`;
  return ['monospace', 'serif', 'sans-serif'].some(g => width(`${quoted}, ${g}`) !== width(g)) && width(`${quoted}, monospace`) !== width('monospace');
}

export function resolveFont(requested: string, ctx: { font: string; measureText(t: string): { width: number } } | null): ResolvedFont {
  const p = parsePostScriptName(requested); const hit = libraryIndex.get(norm(p.family));
  const stack = (fam: string, fb: string) => `"${p.family}", "${fam}", ${fb}`;
  if (isInstalled(p.family, ctx)) return { requested, family: p.family, css: `"${p.family}", ${hit?.fallback || 'sans-serif'}`, weight: p.weight, italic: p.italic, status: 'installed' };
  if (hit) { ensureFontsLoaded([hit.key]); return { requested, family: hit.family, css: `"${hit.family}", ${hit.fallback}`, weight: p.weight, italic: p.italic, status: 'library' }; }
  const sub = SUBSTITUTES[norm(p.family)] || SUBSTITUTES[norm(requested)] || CLASS_FALLBACK.find(([re]) => re.test(requested))![1];
  const lib = libraryIndex.get(norm(String(sub))); if (lib) ensureFontsLoaded([lib.key]);
  return { requested, family: lib?.family || String(sub), css: stack(lib?.family || String(sub), lib?.fallback || 'sans-serif'), weight: p.weight, italic: p.italic, status: 'substitute' };
}

export function resolveFontsInPage(names: string[]): Record<string, ResolvedFont> {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d') : null;
  const out: Record<string, ResolvedFont> = {};
  for (const n of names) out[n] = resolveFont(n, ctx);
  return out;
}
