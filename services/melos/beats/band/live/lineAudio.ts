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
  guitar: 'This is LYRA\'s guitar — modelled string stiffness, bridge coupling, pick position, and body warmth from classical gut to amplified pickups.',
  pluck: 'These are LYRA\'s plucked family — harp soundboards, paired mandolin courses, banjo skins, and crisp orchestra pizzicato.',
  violin: 'This is LYRA\'s bowed string — continuous Helmholtz stick-slip bow traction driving a carved spruce top with its 2.3 kHz Bridge Hill.',
  sax: 'This is LYRA\'s saxophone — a single bamboo reed pulsing against a conical brass bore that flips smoothly into altissimo overblows.',
  trumpet: 'This is LYRA\'s trumpet — buzzing lips driving a bright flare bell that blooms into brassy cuivré edge as you push harder.',
  brass: 'This is the rest of the brass section — French horn, flugelhorn, trombone slide flare, and sub-octave tuba bore.',
  flute: 'This is LYRA\'s flute — an air jet whistling across the embouchure hole into an open cylindrical bore with breath chiff on every attack.',
  clarinet: 'This is LYRA\'s clarinet — a single reed sealing a closed cylinder, lifting pure odd harmonics in the hollow chalumeau register.',
  reed: 'These are LYRA\'s double reeds — two bound cane blades feeding narrow conical oboe and bassoon bores rich in nasal formants.',
};

/** Openers for Chora's other instrument engines when the Session Band joins at the desk. */
export const PANEL_SEAT_INTROS: Record<string, string> = {
  tonos: 'This is TONOS — 52 traditional stringed instruments modelled by physical string length, jawari grazing bridges, bow rosin, skin resonators, and sympathetic taraf strings.',
  aura: 'This is AURA — warm 1960s and 1970s voltage-controlled analogue oscillators, ladder filters, BBD ensembles, and aged drawbar organs.',
  onda: 'This is ONDA — high-resolution wavetable morphing, dual analog-style ladder filters, unison spread, and programmable Motion lanes.',
  bajo: 'This is BAJO — sub-weight low-end synthesis with tempo-locked wobble lanes, four-band gating, and acoustic upright pluck at the warm end.',
  vela: 'This is VELA — continuous additive modal resynthesis where overtone stiffness, strike position, and tilt turn bars, bowls, and strings into living sustains.',
  cantus: 'This is CANTUS — vowel and formant-sculpted spectral overtone singing shaped from the fundamental up.',
  ison: 'This is ISON — modal tonic-and-fifth drone architecture built to anchor slow harmonic stillness.',
  pneuma: 'This is PNEUMA — physical air, flute overtone turbulence, and bowed breath sustained without harsh transients.',
  kera: 'This is KERA — multi-zone sampler for SoundFonts, SFZ libraries, and your own chopped field recordings.',
  volta: 'This is VOLTA — a dual-era circuit-modeled Super-Synth pairing 1974 discrete transistor ladders, 1N4148 diodes, and 12V rail sag with Buchla wavefolding, Thru-Zero FM, and a 2026 Cytomic ZDF filter — buildable for real in Plajah Builder.',
  kit: 'This is our Maschine-style kit rack — 16 velocity-responsive pads per bank wired through Chora\'s mix and swing engine.',
};
