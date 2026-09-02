// titleAnimators — per-glyph text animation (W3b: Title Studio / Type-On / Universe text tools).
//
// Pure functions of (text, clip-local time, animator settings) → per-glyph state, consumed by
// BOTH the DOM monitor (spans) and the canvas title renderer (export), so the animation is
// identical in preview and MP4. Deterministic: scramble uses a seeded hash, no Math.random.
export type TitleAnimType = 'none' | 'typeOn' | 'fadeUp' | 'fadeIn' | 'tracking' | 'scramble' | 'wordSlide' | 'blurIn' | 'dropIn';
export interface TitleAnim {
  type: TitleAnimType;
  /** Seconds the IN animation takes. */
  duration: number;
  /** Seconds before the IN starts. */
  delay?: number;
  /** Seconds the OUT animation takes (0 = no out). Plays at the end of the clip. */
  out?: number;
  /** 0..1 — how much of the duration is spread across glyphs (0 = all together, 1 = fully staggered). */
  stagger?: number;
}
export interface GlyphState {
  char: string;
  /** 0..1 */
  opacity: number;
  /** Offsets as a fraction of the glyph's font size. */
  dx: number; dy: number;
  scale: number;
  /** Blur in font-size fractions (0 = sharp). */
  blur: number;
  /** Extra letter-spacing as a fraction of font size. */
  spacing: number;
}
export const TITLE_ANIMS: { id: TitleAnimType; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'typeOn', label: 'Type On' }, { id: 'fadeUp', label: 'Fade Up' }, { id: 'fadeIn', label: 'Fade In' },
  { id: 'tracking', label: 'Tracking In' }, { id: 'scramble', label: 'Scramble' }, { id: 'wordSlide', label: 'Word Slide' }, { id: 'blurIn', label: 'Blur In' }, { id: 'dropIn', label: 'Drop In' },
];
export const TITLE_ANIM_DEFAULT: TitleAnim = { type: 'none', duration: 1, delay: 0, out: 0, stagger: .6 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p);
const easeInOut = (p: number) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const hash = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$';

/** Per-glyph IN progress (0..1) with stagger; identical for the out phase (reversed). */
function glyphProgress(i: number, n: number, t: number, anim: TitleAnim): number {
  const stag = clamp01(anim.stagger ?? .6);
  const dur = Math.max(.001, anim.duration);
  const start = (anim.delay || 0) + (n > 1 ? (i / (n - 1)) * dur * stag : 0);
  const each = dur * (1 - stag) + dur * stag / Math.max(1, n) * 1.5; // each glyph's own ramp
  return clamp01((t - start) / Math.max(.001, each));
}

/** Whole-title out progress (1 = fully out) for the tail of the clip. */
export function titleOutProgress(t: number, clipDuration: number, anim: TitleAnim): number {
  const out = anim.out || 0; if (out <= 0) return 0;
  return clamp01((t - (clipDuration - out)) / out);
}

export function glyphStates(text: string, t: number, anim: TitleAnim | undefined | null, clipDuration = Infinity): GlyphState[] {
  const chars = Array.from(text || '');
  const n = chars.length;
  const a = anim || TITLE_ANIM_DEFAULT;
  if (!a || a.type === 'none') return chars.map(c => ({ char: c, opacity: 1, dx: 0, dy: 0, scale: 1, blur: 0, spacing: 0 }));
  const outP = titleOutProgress(t, clipDuration, a);
  const words: number[] = []; let w = 0; for (const c of chars) { if (c === ' ') w++; words.push(w); }
  return chars.map((char, i) => {
    let p = glyphProgress(i, n, t, a);
    // Out phase: reverse the same animator over the tail.
    if (outP > 0) p = Math.min(p, 1 - easeInOut(outP));
    const e = easeOut(p);
    const s: GlyphState = { char, opacity: 1, dx: 0, dy: 0, scale: 1, blur: 0, spacing: 0 };
    switch (a.type) {
      case 'typeOn': s.opacity = p > 0 ? 1 : 0; if (char !== ' ' && p > 0 && p < .35) s.char = char; break;
      case 'fadeUp': s.opacity = e; s.dy = (1 - e) * .6; break;
      case 'fadeIn': s.opacity = e; break;
      case 'tracking': s.opacity = e; s.spacing = (1 - e) * .8; break;
      case 'scramble': {
        if (char === ' ') break;
        if (p < 1) { const k = Math.floor(t * 18); s.char = SCRAMBLE[Math.floor(hash(i, k) * SCRAMBLE.length)]; s.opacity = p > 0 ? .85 : 0; }
        break;
      }
      case 'wordSlide': { const wp = glyphProgress(words[i], Math.max(1, words[n - 1] + 1), t, a); const we = easeOut(outP > 0 ? Math.min(wp, 1 - easeInOut(outP)) : wp); s.opacity = we; s.dx = (1 - we) * -1.2; break; }
      case 'blurIn': s.opacity = e; s.blur = (1 - e) * .5; s.scale = 1 + (1 - e) * .15; break;
      case 'dropIn': s.opacity = e; s.dy = -(1 - e) * 1.4; s.scale = 1 + (1 - e) * .3; break;
    }
    return s;
  });
}

/** True when any glyph is not in its final state (so renderers can skip caching). */
export function isTitleAnimating(t: number, anim: TitleAnim | undefined | null, clipDuration = Infinity): boolean {
  if (!anim || anim.type === 'none') return false;
  const dur = (anim.delay || 0) + anim.duration + .05;
  if (t < dur) return true;
  return titleOutProgress(t, clipDuration, anim) > 0;
}
