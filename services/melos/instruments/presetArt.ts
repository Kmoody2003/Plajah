// Preset cover art + curated notes — the "a sound has a face and a story" layer, shared by every
// instrument (ONDA, KERA, FONDO).
//
// Real cover images would be megabytes of shipped assets that go stale; instead a cover is
// GENERATED deterministically from the preset's name, so the same sound always wears the same
// face, it costs nothing to ship, and a brand-new user preset gets art for free. The notes are the
// teaching hook the platform keeps asking for: a one-liner from an engineer's head about WHY the
// sound works, not just what it's called.

const CATEGORY_ACCENT: Record<string, string> = {
  Bass: '#FF2E88', Lead: '#00DAF3', Pad: '#B84DFF', Keys: '#57E389',
  Pluck: '#FFC24B', Atmosphere: '#7C86FF', FX: '#FF8C00', Arp: '#00DAF3',
  // sampler / other
  Sampler: '#00DAF3', Drums: '#FF8C00', Vocal: '#FF6E9E', Default: '#B84DFF',
};

export const accentFor = (category?: string): string => CATEGORY_ACCENT[category || 'Default'] || CATEGORY_ACCENT.Default;

/** Cheap deterministic string hash (FNV-1a) → 32-bit unsigned. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Shift a hex colour's hue by generating a companion from the seed — keeps covers in-family but
 *  never identical. Returns an `hsl()` string. */
function companion(seed: number, baseHex: string): string {
  // derive an hsl from the accent, then rotate hue by a seed-driven amount
  const r = parseInt(baseHex.slice(1, 3), 16), g = parseInt(baseHex.slice(3, 5), 16), b = parseInt(baseHex.slice(5, 7), 16);
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2;
  const d = max - min; let hh = 0;
  if (d) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    hh = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  const rot = (seed % 80) - 40; // ±40°, in-family
  return `hsl(${Math.round((hh + rot + 360) % 360)} 70% ${Math.round((0.32 + (l * 0.3)) * 100)}%)`;
}

/**
 * A CSS `background` string for a cover: a matte base, a seed-placed accent glow, a companion hue,
 * and a fine hatch — the same visual family as the design review, generated per preset.
 */
export function coverCss(seed: string, category?: string): string {
  const h = hash(seed);
  const accent = accentFor(category);
  const comp = companion(h, accent);
  const ang = h % 360;
  const px = 25 + (h % 50), py = 25 + ((h >> 8) % 50);
  return [
    `radial-gradient(120% 90% at ${px}% ${py}%, ${accent}cc, transparent 60%)`,
    `conic-gradient(from ${ang}deg at 60% 40%, ${comp}, #0b0b12 55%, ${comp})`,
    `linear-gradient(135deg, #0c0c11, #101018)`,
  ].join(',');
}

/**
 * Curated engineer notes for the ONDA factory bank — the teaching hooks. Keyed by preset name; the
 * gallery falls back to a preset's own `description`, then its tags. Kept here (not inline in the
 * bank) so the *why* of every sound lives in one reviewable place — the seed of Melos's ambient
 * teaching layer.
 */
export const PRESET_NOTES: Record<string, string> = {
  '808 Deep': 'A sine sub with just enough drive to survive small speakers. The pitch glide is what makes it read as an 808 and not just a low note.',
  'Reese Wide': 'Two detuned saws beating against each other — the movement is the unison, not an LFO. Mono the lows before you widen the top.',
  'Sub Bass': 'Almost a pure sine. Keep it centred and mono below 90 Hz; a panned sub disappears on a club system.',
  'Acid 303': 'A ladder filter with high resonance and envelope on the cutoff — the squelch is the filter self-oscillating as it opens.',
  'Supersaw': 'Seven saws spread in unison. Width comes from detune, not stereo tricks, so it stays powerful in mono and huge in surround.',
  'Hoover': 'The rave stab: detuned saws through a fast filter sweep. Best played as short stabs, not held.',
  'Pluck Bright': 'A short, filtered decay with the amp and filter envelopes moving together — the "pluck" is the two envelopes agreeing.',
  'Warm Keys': 'Gentle wavetable motion under a soft filter. The slight detune is what stops it sounding sterile and digital.',
  'Glass Pad': 'High harmonics under a slow LFO on the wavetable — evolving, never static. Hold a chord and let it move.',
  'Cinematic Swell': 'A long attack and a slow filter open — the tension is all in the envelope times. Automate the macro for a riser.',
  'Formant Vox': 'A vowel wavetable swept by the morph knob mimics a mouth opening. Small morph moves read as words.',
  'Noise Riser': 'Filtered noise with an upward pitch and filter ramp — the classic transition FX. Time it to land on the downbeat.',
};
