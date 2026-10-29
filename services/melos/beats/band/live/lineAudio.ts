// Pre-rendered character lines — each character's fixed lines recorded once in their designed voice
// (scripts/band/renderBandLines.ts → public/band/voice/<id>/), with word timings so captions and the
// avatar's mouth follow the real recording. At runtime a line plays from its clip when one exists,
// otherwise the on-device voice speaks it. Keys are a stable hash of voice + exact text, shared by
// the render script and the app. Also: the openers LYRA's band seat uses (shared with the script).

/** FNV-1a 32-bit, as hex — the clip name for a voice + line. */
export function lineKey(voiceId: string, text: string): string {
  let h = 0x811c9dc5;
  const s = `${voiceId}|${text}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The director's spacing rule (director.fill) — a pre-rendered line must match it exactly. */
export const normalizeLine = (t: string): string => t.replace(/\s+/g, ' ').trim();

export interface LineClip { file: string; durationMs: number; /** Start of each word (split on whitespace), ms. */ words: number[] }
export interface LineManifest { voiceId: string; lines: Record<string, LineClip> }

export const lineManifestUrl = (characterId: string) => `/band/voice/${characterId}/manifest.json`;

/** What LYRA's band seat says to open, per model (the {intro} in its players' greetings). */
export const LYRA_SEAT_INTROS: Record<string, string> = {
  tine: 'This is our tine electric piano, modelled on the pianos Harold Rhodes built: a hammer strikes a thin steel tine bolted to a tone bar, and a pickup turns its motion into sound.',
  piano: 'This is LYRA\'s piano — felt hammers on one to three strings a note, and a soundboard, all modelled.',
};
